from io import BytesIO
import warnings

import numpy as np
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError


Image.MAX_IMAGE_PIXELS = 16_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MODEL_VERSION = "visual-screening-1"


class PhotoError(ValueError):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


def decode_photo(payload: bytes, max_side: int) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(payload)) as source:
                if source.format not in ALLOWED_FORMATS:
                    raise PhotoError(415, "UNSUPPORTED_IMAGE")
                if getattr(source, "n_frames", 1) != 1:
                    raise PhotoError(415, "UNSUPPORTED_IMAGE")
                if max(source.size) > 8192:
                    raise PhotoError(413, "IMAGE_DIMENSIONS_TOO_LARGE")
                if min(source.size) < 80:
                    raise PhotoError(422, "IMAGE_TOO_SMALL")
                ImageOps.exif_transpose(source, in_place=True)
                source.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                if "A" in source.getbands() or "transparency" in source.info:
                    overlay = source.convert("RGBA")
                    background = Image.new("RGBA", overlay.size, "white")
                    return Image.alpha_composite(background, overlay).convert("RGB")
                return source.convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise PhotoError(413, "IMAGE_DIMENSIONS_TOO_LARGE") from error
    except UnidentifiedImageError as error:
        raise PhotoError(415, "UNSUPPORTED_IMAGE") from error
    except (OSError, SyntaxError) as error:
        raise PhotoError(422, "INVALID_IMAGE") from error


def prepare_photo(payload: bytes) -> bytes:
    photo = decode_photo(payload, 1440)
    photo.info.clear()
    with BytesIO() as output:
        photo.save(output, "JPEG", quality=87, optimize=True)
        return output.getvalue()


def analyze_photo(payload: bytes) -> dict:
    photo = decode_photo(payload, 320)
    width, height = photo.size
    margin_x, margin_y = int(width * 0.06), int(height * 0.06)
    photo = photo.crop((margin_x, margin_y, width - margin_x, height - margin_y))

    hue, saturation, value = np.asarray(photo.convert("HSV")).transpose(2, 0, 1)
    red, _, blue = np.asarray(photo, dtype=np.int16).transpose(2, 0, 1)
    green = (hue >= 43) & (hue <= 122) & (saturation >= 55) & (value >= 53)
    green_share = float(green.mean())
    result = {"modelVersion": MODEL_VERSION, "outcome": "uncertain", "findings": []}

    if green_share < 0.085 or float(np.median(value)) < 43:
        return {
            **result,
            "quality": round(min(0.4, green_share * 3), 3),
        }

    # Restrict changes to neighborhoods with green tissue so plain soil or a yellow backdrop
    # away from the leaf do not count as symptoms. These are visual cues, not a classifier.
    green_density = np.asarray(
        Image.fromarray(green.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(7)),
    )
    yellow = (
        (green_density > 27) & (hue >= 24) & (hue <= 42) & (saturation >= 82)
        & (value >= 105) & (red - blue >= 32)
    )
    local_brightness = np.asarray(Image.fromarray(value).filter(ImageFilter.MedianFilter(9)), dtype=np.int16)
    dark = (
        (green_density > 45) & (hue <= 37) & (saturation >= 54) & (value >= 32)
        & (value < 167) & (red - blue >= 11) & (local_brightness - value >= 11)
    )

    visible_pixels = int(np.count_nonzero(green | yellow | dark))
    yellow_pixels = int(np.count_nonzero(yellow))
    dark_pixels = int(np.count_nonzero(dark))
    findings = result["findings"]
    if yellow_pixels >= max(45, visible_pixels * 0.08):
        findings.append({
            "code": "yellowing",
            "label": "Có vùng lá ngả vàng",
            "detail": "Vùng vàng nằm gần mô lá xanh. Hãy đối chiếu lá già và lá non, độ ẩm đất và mặt dưới lá.",
        })
    if dark_pixels >= max(28, visible_pixels * 0.005):
        findings.append({
            "code": "dark_spots",
            "label": "Có chấm nâu hoặc vùng sẫm",
            "detail": "Ảnh có vùng sẫm cục bộ quanh mô xanh. Kiểm tra mặt dưới lá và chụp lại ở ánh sáng đều.",
        })

    quality = round(min(0.95, 0.45 + green_share), 3)
    if not findings and green_share >= 0.22:
        result["outcome"] = "healthy"
    return {**result, "quality": quality}
