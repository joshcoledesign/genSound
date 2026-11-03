# drawing_utils.py

from PIL import Image, ImageDraw

def create_canvas(image_width, image_height):
    return Image.new("RGB", (image_width, image_height), "black")

def draw_pixel(canvas, x, y, color_rgb, pixel_size=1):
    draw = ImageDraw.Draw(canvas)
    # Draw a square of size pixel_size x pixel_size
    draw.rectangle([x, y, x + pixel_size - 1, y + pixel_size - 1], fill=color_rgb)

def save_canvas(canvas, output_path):
    canvas.save(output_path)
