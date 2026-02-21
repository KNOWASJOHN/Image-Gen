import os
import uuid
import time
import requests as http_requests

from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Ensure the generated images directory exists
GENERATED_DIR = os.path.join(app.static_folder, "generated")
os.makedirs(GENERATED_DIR, exist_ok=True)

# Freepik Mystic API configuration
FREEPIK_API_KEY = os.getenv("FREEPIK_API_KEY")
FREEPIK_BASE_URL = "https://api.freepik.com/v1/ai/mystic"

if not FREEPIK_API_KEY:
    print("⚠️  WARNING: FREEPIK_API_KEY not set. Create a .env file with your key.")

# Aspect ratio mapping (frontend values → Freepik API values)
ASPECT_RATIO_MAP = {
    "1:1": "square_1_1",
    "4:3": "landscape_4_3",
    "3:4": "portrait_3_4",
    "16:9": "widescreen_16_9",
    "9:16": "portrait_9_16",
}


def freepik_headers():
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
    }


@app.route("/")
def index():
    """Serve the main web UI."""
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def generate_images():
    """Generate images using Freepik Mystic API."""
    if not FREEPIK_API_KEY:
        return jsonify({"error": "FREEPIK_API_KEY is not configured. Please set it in your .env file."}), 500

    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    num_images = int(data.get("num_images", 1))
    aspect_ratio = data.get("aspect_ratio", "1:1")

    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    # Clamp number of images to 1-4
    num_images = max(1, min(4, num_images))

    # Map aspect ratio to Freepik format
    freepik_ratio = ASPECT_RATIO_MAP.get(aspect_ratio, "square_1_1")

    image_urls = []
    errors = []

    # Freepik generates 1 image per API call, so loop for multiple
    for i in range(num_images):
        try:
            # Step 1: Submit the generation task
            payload = {
                "prompt": prompt,
                "aspect_ratio": freepik_ratio,
            }

            resp = http_requests.post(
                FREEPIK_BASE_URL,
                json=payload,
                headers=freepik_headers(),
                timeout=30,
            )

            if resp.status_code != 200:
                error_detail = resp.json() if resp.text else resp.status_code
                errors.append(f"Image {i+1}: API error {error_detail}")
                continue

            task_data = resp.json().get("data", {})
            task_id = task_data.get("task_id")

            if not task_id:
                errors.append(f"Image {i+1}: No task_id returned")
                continue

            # Step 2: Poll for completion (max 60 seconds per image)
            generated_urls = poll_task(task_id, max_wait=60)

            if generated_urls:
                # Step 3: Download and save images locally
                for img_url in generated_urls:
                    local_url = download_image(img_url)
                    if local_url:
                        image_urls.append(local_url)
            else:
                errors.append(f"Image {i+1}: Generation timed out or failed")

        except Exception as e:
            error_msg = str(e)
            print(f"Error generating image {i+1}: {error_msg}")
            errors.append(f"Image {i+1}: {error_msg}")

    if not image_urls:
        error_detail = "; ".join(errors) if errors else "Unknown error"
        return jsonify({"error": f"Image generation failed: {error_detail}"}), 500

    result = {"images": image_urls, "prompt": prompt}
    if errors:
        result["warnings"] = errors

    return jsonify(result)


def poll_task(task_id, max_wait=60):
    """Poll Freepik task until completion or timeout."""
    url = f"{FREEPIK_BASE_URL}/{task_id}"
    start_time = time.time()

    while time.time() - start_time < max_wait:
        try:
            resp = http_requests.get(url, headers=freepik_headers(), timeout=15)

            if resp.status_code == 200:
                data = resp.json().get("data", {})
                status = data.get("status", "")

                if status == "COMPLETED":
                    return data.get("generated", [])
                elif status in ("FAILED", "ERROR"):
                    print(f"Task {task_id} failed with status: {status}")
                    return None

            time.sleep(2)  # Wait 2 seconds before next poll

        except Exception as e:
            print(f"Error polling task {task_id}: {e}")
            time.sleep(2)

    print(f"Task {task_id} timed out after {max_wait}s")
    return None


def download_image(url):
    """Download an image from URL and save locally. Returns local URL path."""
    try:
        resp = http_requests.get(url, timeout=30)
        if resp.status_code == 200:
            # Determine extension from content type
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            ext = "jpg"
            if "png" in content_type:
                ext = "png"
            elif "webp" in content_type:
                ext = "webp"

            filename = f"{uuid.uuid4().hex}.{ext}"
            filepath = os.path.join(GENERATED_DIR, filename)

            with open(filepath, "wb") as f:
                f.write(resp.content)

            return f"/static/generated/{filename}"
    except Exception as e:
        print(f"Error downloading image: {e}")

    return None


@app.route("/api/gallery", methods=["GET"])
def gallery():
    """Return list of all previously generated images."""
    files = []
    if os.path.exists(GENERATED_DIR):
        for f in sorted(os.listdir(GENERATED_DIR), reverse=True):
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                files.append(f"/static/generated/{f}")
    return jsonify({"images": files})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
