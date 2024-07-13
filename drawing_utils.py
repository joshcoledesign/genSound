from PIL import Image


def create_canvas(width, height):
    return Image.new("RGB", (width, height), "black")


def draw_pixel(canvas, x, y, color_rgb, size):
    for i in range(size):
        for j in range(size):
            canvas.putpixel((x + i, y + j), color_rgb)


def save_canvas(canvas, output_path):
    canvas.save(output_path)
