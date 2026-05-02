import sys
from PIL import Image

def remove_white_background(image_path, output_path=None):
    if output_path is None:
        output_path = image_path
        
    try:
        img = Image.open(image_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Change all white (also shades of whites)
            # to transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Successfully processed {image_path}")
    except Exception as e:
        print(f"Error processing {image_path}: {e}")

if __name__ == "__main__":
    base_path = r"c:\Users\rkj24\OneDrive\Desktop\DataReaper\frontend\public\images"
    remove_white_background(f"{base_path}\\onboarding-sleuth-dome.png")
    remove_white_background(f"{base_path}\\onboarding-shield-dome.png")
