import io
import zipfile
from pathlib import Path

from flask import Flask, render_template, jsonify, request, send_file

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
VIEWER_SRC_DIR = BASE_DIR / "viewer"

SHARED_MODULES = [
    "surfaceline.js",
    "outlineRenderer.js",
    "annotationStore.js",
    "annotationPicker.js",
]
VIEWER_FILES = [
    "index.html",
    "viewer.js",
    "viewerPanel.js",
    "styles.css",
]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/viewer-assets")
def viewer_assets():
    assets = {name: (STATIC_DIR / name).read_text() for name in SHARED_MODULES}
    assets.update({name: (VIEWER_SRC_DIR / name).read_text() for name in VIEWER_FILES})
    return jsonify(assets)


@app.route("/generate-zip", methods=["POST"])
def generate_zip():
    """fallback for browsers without the file System Access api"""
    model = request.files.get("model")
    annotations = request.form.get("annotations")
    if model is None or annotations is None:
        return jsonify({"error": "Both a model and annotations are required."}), 400

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in SHARED_MODULES:
            bundle.write(STATIC_DIR / name, name)
        for name in VIEWER_FILES:
            bundle.write(VIEWER_SRC_DIR / name, name)
        bundle.writestr("annotations.json", annotations)
        bundle.writestr("model.glb", model.read())
    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="viewer.zip",
    )


if __name__ == "__main__":
    app.run(debug=True)
