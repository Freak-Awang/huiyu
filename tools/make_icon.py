"""从源 logo 生成 Windows 应用图标资源：多尺寸 .ico 与运行时 PNG。"""
from pathlib import Path

from PIL import Image

SRC = Path(r"E:\CodeX\linghui-im\app\im-web\src\assets\art talk logo1.png")
BUILD_DIR = Path(r"E:\CodeX\linghui-im\app\im-web\build")
PUBLIC_DIR = Path(r"E:\CodeX\linghui-im\app\im-web\public")
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

def to_square(img: Image.Image) -> Image.Image:
    """非正方形图片等比缩放后居中放到透明正方形画布，避免 ICO 拉伸变形。"""
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas

def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    square = to_square(src)
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    square.save(BUILD_DIR / "icon.ico", sizes=SIZES)
    square.resize((256, 256), Image.LANCZOS).save(PUBLIC_DIR / "app-icon.png")
    square.resize((32, 32), Image.LANCZOS).save(PUBLIC_DIR / "app-icon-32.png")
    print(f"source={src.size} -> icon.ico ({len(SIZES)} sizes), app-icon.png (256), app-icon-32.png (32)")

if __name__ == "__main__":
    main()
