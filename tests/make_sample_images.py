from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).parent.parent / "samples" / "images"
OUT.mkdir(parents=True, exist_ok=True)
FONT = next(
    (p for p in ("C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf") if Path(p).exists()), None
)
f = lambda n: ImageFont.truetype(FONT, n) if FONT else ImageFont.load_default()
rng = np.random.default_rng(1)


def certificate(name="Иванов Иван Иванович", course="Machine Learning Specialization", org="Coursera / Stanford University"):
    im = Image.new("RGB", (1600, 1130), (252, 249, 240))
    d = ImageDraw.Draw(im)
    d.rectangle((30, 30, 1570, 1100), outline=(150, 110, 40), width=8)
    d.text((800, 170), "СЕРТИФИКАТ", font=f(90), fill=(120, 80, 20), anchor="mm")
    d.text((800, 300), "об успешном завершении курса", font=f(36), fill=(60, 60, 60), anchor="mm")
    d.text((800, 440), name, font=f(64), fill=(20, 20, 70), anchor="mm")
    d.text((800, 560), f"«{course}»", font=f(48), fill=(30, 30, 30), anchor="mm")
    d.text((800, 650), f"Организатор: {org}", font=f(34), fill=(60, 60, 60), anchor="mm")
    d.text((800, 760), "Общая продолжительность видео-лекций: 62 часа", font=f(34), fill=(60, 60, 60), anchor="mm")
    d.text((800, 900), "Дата выдачи: 14 марта 2025", font=f(32), fill=(60, 60, 60), anchor="mm")
    a = np.asarray(im).astype(np.float32) + rng.normal(0, 2.5, (1130, 1600, 3))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def acceptance_letter(doi="10.5555/12345680", title="A Methodology for the Emulation of Architecture"):
    im = Image.new("RGB", (1240, 1754), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((100, 120), "Journal of Psychoceramics", font=f(54), fill=(20, 40, 90))
    d.line((100, 200, 1140, 200), fill=(20, 40, 90), width=4)
    d.text((100, 280), "Letter of publication", font=f(40), fill=(30, 30, 30))
    d.text((100, 380), "Dear Dr. Josiah Carberry,", font=f(32), fill=(30, 30, 30))
    d.text((100, 450), "your article has been published:", font=f(32), fill=(30, 30, 30))
    d.text((100, 530), f"«{title}»", font=f(32), fill=(10, 10, 10))
    d.text((100, 610), f"DOI: {doi}", font=f(34), fill=(10, 10, 10))
    d.text((100, 670), "ORCID: 0000-0002-1825-0097", font=f(34), fill=(10, 10, 10))
    qr = cv2.QRCodeEncoder.create().encode(f"https://doi.org/{doi}")
    qr = cv2.resize(qr, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
    im.paste(Image.fromarray(qr).convert("RGB"), (100, 800))
    d.text((100 + qr.shape[1] + 40, 800 + qr.shape[0] // 2), "Scan to open the article", font=f(28), fill=(80, 80, 80))
    return im


if __name__ == "__main__":
    c = certificate()
    c.save(OUT / "certificate_sharp.jpg", quality=92)
    c.filter(ImageFilter.GaussianBlur(4.5)).save(OUT / "certificate_blurred.jpg", quality=90)
    data = (OUT / "certificate_sharp.jpg").read_bytes()
    (OUT / "certificate_truncated.jpg").write_bytes(data[: len(data) * 55 // 100])
    e = Image.open(OUT / "certificate_sharp.jpg")
    d = ImageDraw.Draw(e)
    d.rectangle((420, 870, 1180, 940), fill=(252, 249, 240))
    d.text((800, 900), "Дата выдачи: 14 марта 2023", font=f(31), fill=(70, 60, 60), anchor="mm")
    ex = e.getexif()
    ex[0x0131] = "Adobe Photoshop 25.1 (Windows)"
    e.save(OUT / "certificate_edited.jpg", quality=90, exif=ex)
    acceptance_letter().save(OUT / "publication_letter_qr.png")
    print("ok", sorted(p.name for p in OUT.iterdir()))
