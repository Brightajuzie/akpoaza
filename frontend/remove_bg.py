import * as dotenv from 'dotenv';
from PIL import Image
import numpy as np

def remove_white_background(input_path, output_path, threshold=230):
    img = Image.open(input_path).convert("RGBA")
    data = np.array(img)
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    # Create a mask: pixels that are near-white become transparent
    white_mask = (r > threshold) & (g > threshold) & (b > threshold)
    data[white_mask, 3] = 0
    result = Image.fromarray(data)
    result.save(output_path)
    print(f"Saved transparent image to {output_path}")

remove_white_background(
    r"C:\Users\user\Downloads\fixmart.png",
    r"C:\Users\user\Documents\AI_Apps\handyman-ecommerce\frontend\assets\logo_transparent.png"
)
