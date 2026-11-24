import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../../errors.js';
import { screeningSpecies, type ScreeningSpecies } from '../diagnosis/guidance.js';
import { AttemptWindow } from '../auth/throttle.js';
import { answerSubquestions, careAnswer, clarifyAnswer, compareCare, reply, scopeReply, unclearReply, type Reply } from './care-replies.js';
import { configuredChatModel } from './model.js';
import { readChatPlant } from './plant-context.js';
import { aboutOwnPlant, answerAboutPlant, plantQuestionKind } from './plant-replies.js';
import { loadChatScreening } from './screening.js';
import { greetingAnswer, unclearInput, understandQuestion } from './language.js';
import { findGuides, latestWatering, siteAnswer } from './knowledge.js';

const input = z.strictObject({
  question: z.string().trim().min(1).max(600).refine(value => !value.includes('\0')),
  speciesCode: z.enum(screeningSpecies).optional(),
  plantId: z.uuid().transform(id => id.toLowerCase()).optional(),
  diagnosisId: z.uuid().optional(),
  contextDiagnosisId: z.uuid().optional(),
  requestId: z.uuid().optional(),
}).refine(value => !(value.diagnosisId && value.contextDiagnosisId));
type Answer = Reply & { speciesCode: ScreeningSpecies | null };
type Turn = { requestId: string; question: string; reply: Answer; diagnosisId: string | null; plantId: string | null };
const turnFields = 'request_id AS "requestId", question, answer AS reply, diagnosis_id AS "diagnosisId", plant_id AS "plantId"';
const siteGuide = 'PlantCare có các mục Vườn cây, Đặt lịch, Chẩn đoán, Trợ lý AI, Cộng đồng và Hồ sơ. Đính kèm ảnh ở Trợ lý AI để sàng lọc và hỏi tiếp. Xem các lần sàng lọc trong Chẩn đoán. Đổi email, đổi mật khẩu và xác minh email trong Hồ sơ. Trong ô chat, dùng nút + để chọn ảnh lá, loại cây hoặc hồ sơ cây.';

export function createChatRouter(pool: Pool, requireSession: RequestHandler, requireCsrf: RequestHandler, screeningEnabled = false) {
  const router = Router();
  const model = configuredChatModel();
  const attempts = new AttemptWindow(30);
  const active = new Set<string>();
  const scope = [requireSession, requireCsrf];

  async function recent(owner: string, limit: number) {
    const { rows } = await pool.query<Turn>(`
      SELECT ${turnFields} FROM chat_turns
      WHERE tai_khoan_id = $1 ORDER BY sequence DESC LIMIT $2
    `, [owner, limit]);
    return rows.reverse();
  }

  router.get('/chat', requireSession, async (req, res) => {
    res.json({ items: await recent(req.auth!.user.id, 30), modelEnabled: Boolean(model), screeningEnabled });
  });

  router.get('/chat/screening/:id', requireSession, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new HttpError(400, 'INVALID_INPUT', 'Mã lần sàng lọc không hợp lệ.');
    const result = await loadChatScreening(pool, req.auth!.user.id, id.data);
    if (!result) throw new HttpError(404, 'DIAGNOSIS_NOT_FOUND', 'Không tìm thấy lần sàng lọc.');
    res.json(result);
  });

  router.post('/chat', ...scope, async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_QUESTION', 'Nhập câu hỏi tối đa 600 ký tự và chọn loại cây được hỗ trợ.');
    const { question, diagnosisId, contextDiagnosisId, speciesCode, plantId, requestId = randomUUID() } = parsed.data;
    const owner = req.auth!.user.id;
    const digest = createHash('sha256').update(JSON.stringify([question, speciesCode, diagnosisId, contextDiagnosisId, ...(plantId ? [plantId] : [])])).digest('hex');
    const { rows: [saved] } = await pool.query<Turn & { digest: string }>(`
      SELECT ${turnFields}, request_digest AS digest FROM chat_turns WHERE tai_khoan_id = $1 AND request_id = $2
    `, [owner, requestId]);
    if (saved) {
      if (saved.digest !== digest) throw new HttpError(409, 'CHAT_REQUEST_CONFLICT', 'Mã yêu cầu đã dùng cho tin nhắn khác.');
      res.json({ ...saved.reply, requestId: saved.requestId, diagnosisId: saved.diagnosisId, plantId: saved.plantId });
      return;
    }

    if (active.has(owner) || active.size >= 12 || attempts.retryAfter(owner)) {
      throw new HttpError(429, 'CHAT_BUSY', 'Trợ lý đang xử lý nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    active.add(owner);
    try {
      const history = (await recent(owner, 6)).filter(turn => (turn.plantId ?? null) === (plantId ?? null));
      const current = understandQuestion(question);
      const { words, crop: typedCrop, crops, followUp, aboutPlants, aboutSite, outside } = current;
      const previous = history.at(-1);
      const greeting = greetingAnswer(words);
      const unclear = greeting ? null : unclearInput(question, current);
      const navigation = siteAnswer(words);
      const plant = plantId ? await readChatPlant(pool, owner, plantId) : null;
      const chosenCrop = plant?.speciesCode ?? typedCrop ?? speciesCode;
      const previousIntent = previous ? understandQuestion(previous.question) : undefined;
      const aboutImage = current.aboutImage || (current.timeQuestion && Boolean(previous?.diagnosisId || previousIntent?.aboutImage));
      let contextId = diagnosisId ?? contextDiagnosisId;
      if (!contextId && aboutImage && !outside && !navigation) {
        const { rows: [photoTurn] } = await pool.query<{ diagnosisId: string }>(`
          SELECT diagnosis_id AS "diagnosisId" FROM chat_turns
          WHERE tai_khoan_id = $1 AND diagnosis_id IS NOT NULL AND plant_id IS NOT DISTINCT FROM $2::uuid
            AND ($3::text IS NULL OR answer->>'speciesCode' = $3)
          ORDER BY sequence DESC LIMIT 1
        `, [owner, plantId ?? null, chosenCrop ?? null]);
        contextId = photoTurn?.diagnosisId;
      }
      const photo = contextId ? await loadChatScreening(pool, owner, contextId) : null;
      if ((diagnosisId || contextDiagnosisId) && !photo) throw new HttpError(404, 'DIAGNOSIS_NOT_FOUND', 'Không tìm thấy lần sàng lọc.');
      if (photo && plant && photo.plantId !== plant.id) {
        throw new HttpError(409, 'CHAT_PLANT_PHOTO_MISMATCH', 'Ảnh này không gắn với cây đang chọn. Hãy bỏ chọn ảnh hoặc chọn lại cây.');
      }
      const screening = photo && (diagnosisId || contextDiagnosisId || !chosenCrop || photo.speciesCode === chosenCrop) ? photo : null;
      const imageCrop = screeningSpecies.find(candidate => candidate === screening?.speciesCode);
      const comparing = crops.length > 1 && !plant && !screening;
      const conversation = history.map(turn => ({ turn, intent: understandQuestion(turn.question) })).reverse();
      const scopeBoundary = conversation.findIndex(({ intent }) => intent.outside);
      const subjectHistory = conversation.slice(0, scopeBoundary === -1 ? undefined : scopeBoundary);
      const recentCare = subjectHistory.find(({ turn, intent }) => !intent.aboutSite
        && turn.reply.origin !== 'journal' && !siteAnswer(intent.words) && (intent.aboutPlants || Boolean(turn.diagnosisId)));
      const crop = comparing ? undefined : plant?.speciesCode ?? imageCrop ?? chosenCrop
        ?? (followUp ? recentCare?.turn.reply.speciesCode ?? undefined : undefined);
      const resetAt = subjectHistory.findIndex(({ turn, intent }) => {
        const mentionedCrop = intent.crop ?? turn.reply.speciesCode;
        const recentCrop = crop ?? recentCare?.turn.reply.speciesCode;
        return Boolean(recentCare && mentionedCrop && mentionedCrop !== recentCrop);
      });
      const related = (comparing ? [] : subjectHistory.slice(0, resetAt === -1 ? undefined : resetAt).reverse())
        .filter(({ turn, intent }) => turn.reply.origin !== 'journal' && !siteAnswer(intent.words));
      const previousWords = followUp
        ? related.filter(({ turn, intent }) => !turn.diagnosisId && (intent.aboutPlants || intent.followUp))
          .slice(-2).map(({ intent }) => intent.words).join(' ')
        : '';

      const watering = /\b(lan cuoi|lan gan nhat|da tuoi|tuoi (?:lan|hom|ngay) nao)\b/.test(words) && /\btuoi\b/.test(words);
      const futureWatering = /\b(nen|can|se|sap|lich)\b/.test(words);
      const personalized = plant && !diagnosisId && !contextDiagnosisId && !aboutImage && !outside && !greeting && !unclear && !navigation && !watering
        ? await answerAboutPlant(pool, owner, plant, question, previousIntent?.words ?? '') : undefined;

      let result: Reply;
      if (outside) {
        result = scopeReply();
      } else if (diagnosisId) {
        result = reply('Mình đã nhận ảnh. Xem kết quả bên dưới, hoặc hỏi tiếp về dấu hiệu và việc cần làm.');
      } else if (unclear) {
        result = unclearReply(unclear);
      } else if (greeting) {
        result = reply(greeting);
      } else if (navigation) {
        result = reply(navigation);
      } else if (watering && !futureWatering && plant) {
        result = { ...reply(await latestWatering(pool, owner, plant)), origin: 'journal' };
      } else if (personalized) {
        result = personalized;
      } else if (!plant && !contextDiagnosisId && !aboutImage && ((watering && !futureWatering) || (aboutOwnPlant(words) && plantQuestionKind(words)))) {
        result = reply('Bạn bấm dấu + rồi chọn “Đính kèm cây từ Vườn cây” để mình xem đúng hồ sơ. Bạn cũng có thể kể loại cây và điều đang thấy để mình hướng dẫn trước.');
      } else if (aboutImage && !screening) {
        result = reply('Mình chưa tìm thấy ảnh lá phù hợp với câu hỏi này. Bạn có thể gửi ảnh mới hoặc bấm “Hỏi về ảnh này” dưới kết quả đã có.', null, true);
      } else if (screening && (aboutImage || contextDiagnosisId) && screening.status !== 'completed') {
        result = reply(screening.status === 'failed'
          ? 'Lượt kiểm tra ảnh chưa thành công. Bạn có thể thử lại từ thẻ ảnh hoặc gửi ảnh khác.'
          : 'Ảnh đang được phân tích. Mình sẽ hiển thị kết quả trong thẻ ảnh khi có.');
      } else {
        const careWords = previousWords ? words.replace(/^(?:van |con )?(uot|kho|am)$/, 'dat $1') : words;
        const search = [careWords, previousWords].filter(Boolean).join(' ');
        const localGuide = answerSubquestions(question, crop) ?? (comparing ? compareCare(careWords, crops)
          : careAnswer(careWords, crop) ?? (previousWords ? careAnswer(search, crop) : undefined));
        let imageReply: Reply | undefined;
        let imagePlan = false;
        if (screening?.status === 'completed' && screening.guidance && (aboutImage || contextDiagnosisId)) {
          const planIndex = /\b(48|72|sau hai ngay|sau ba ngay|ngay mot)\b/.test(words) ? 2
            : /^(?:vay |the )?mai\b|\bngay mai\b/.test(words) ? 1 : /\b(hom nay|bay gio)\b/.test(words) ? 0 : -1;
          const plan = screening.plan[planIndex];
          imagePlan = Boolean(plan);
          const overview = [screening.guidance.recommendation, ...screening.findings.map(finding => finding.label)].join(' ');
          imageReply = reply(plan ? `${plan.when}: ${plan.steps.join(' ')}` : overview);
        }
        const guides = !imagePlan && (aboutPlants || aboutImage || Boolean(previousWords)) && (model || !localGuide)
          ? await findGuides(pool, crop, search) : [];
        const guide = guides[0];
        const fallback = imageReply ?? localGuide ?? (guide ? reply(guide.text, { title: guide.title, url: guide.url }) : undefined);
        result = fallback ? { ...fallback, origin: 'guide' }
          : clarifyAnswer(words, crop, aboutSite, aboutPlants || Boolean(previousWords));
        if (model && !imagePlan) {
          const sources = [
            ...(localGuide?.source ? [{ ...localGuide.source, text: localGuide.text }] : []),
            ...guides,
          ];
          try {
            const generated = await model(related.map(({ turn }) => ({
              question: turn.question,
              answer: turn.diagnosisId ? 'Đã nhận ảnh.' : turn.reply.text,
            })), {
              speciesCode: crop, mentionedSpecies: crops,
              attachedPlant: plant ? { speciesCode: plant.speciesCode, plantedOn: plant.plantedOn, activities: plant.activities } : null,
              normalizedQuestion: words,
              screening: screening ? { outcome: screening.outcome, findings: screening.findings, guidance: screening.guidance, plan: screening.plan } : null,
              siteGuide,
              sources: sources.map(({ title, text }, id) => ({ id, title, text })),
            }, question);
            const source = generated.sourceId === null ? undefined : sources[generated.sourceId];
            result = generated.unclear ? unclearReply('vague') : generated.inScope
              ? { ...reply(generated.text, source ? { title: source.title, url: source.url } : null, generated.photoSuggested),
                origin: 'model', ...(generated.interpretation ? { interpretation: generated.interpretation } : {}) }
              : scopeReply();
          } catch {
            // Keep the local answer or clarification if the model is unavailable.
          }
        }
      }

      const chatAnswer: Answer = { ...result, speciesCode: crop ?? null };
      const { rows: [turn] } = await pool.query<Turn>(`
        INSERT INTO chat_turns (tai_khoan_id, request_id, question, answer, diagnosis_id, request_digest, plant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tai_khoan_id, request_id) DO NOTHING
        RETURNING ${turnFields}
      `, [owner, requestId, question, chatAnswer, diagnosisId ?? null, digest, plantId ?? null]);
      if (!turn) throw new HttpError(409, 'CHAT_REQUEST_CONFLICT', 'Tin nhắn đã được xử lý. Hãy tải lại cuộc trò chuyện.');
      res.json({ ...turn.reply, requestId: turn.requestId, diagnosisId: turn.diagnosisId, plantId: turn.plantId });
    } finally {
      active.delete(owner);
    }
  });
  return router;
}
