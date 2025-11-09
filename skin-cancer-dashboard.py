# SKIN CANCER DETECTION - VISUAL DASHBOARD
# Author: Jayanth
#
# Flow:
# 1) (Optional) Upload .keras/.h5 model  -> real predictions if provided
# 2) Upload 3–8 lesion images (JPG/PNG)
# 3) Outputs:
#    - Cancer / Not Cancer + probabilities
#    - Dark gallery (aligned)
#    - Top-risk strip
#    - Summary chart
#    - CSV
#    - ZIP + manual Download button (no auto-download)

!pip -q install tensorflow matplotlib

import os, zipfile
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import tensorflow as tf

from google.colab import files
from matplotlib.patches import Rectangle, FancyBboxPatch
from datetime import datetime
from IPython.display import HTML, display

# ============== CONFIG ==============
TITLE         = "Skin Cancer Detection - Results"
AUTHOR        = "Jayanth"
IMG_SIZE      = 224
MALIGNANT_CUT = 0.50
MAX_IMAGES    = 8
BG_COLOR      = "#0f1116"
PANEL_COLOR   = "#141824"
# ====================================

plt.rcParams.update({
    "figure.facecolor": BG_COLOR,
    "axes.facecolor": BG_COLOR,
    "axes.edgecolor": "#ffffff",
    "text.color": "#ffffff",
    "savefig.facecolor": BG_COLOR,
})

# ---------- Basic helpers ----------

def conf_color(p):
    return (0.88, 0.12, 0.15) if p >= MALIGNANT_CUT else (0.10, 0.75, 0.35)

def fmt_pct(p):
    return f"{p*100:.1f}%"

def draw_header(fig):
    ax = fig.add_axes([0.0, 0.93, 1.0, 0.07])
    ax.set_axis_off()
    ax.add_patch(Rectangle((0,0),1,1, transform=ax.transAxes,
                           color=PANEL_COLOR, alpha=1.0))
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    ax.text(0.02, 0.5, TITLE,
            fontsize=19, fontweight="bold",
            va="center", ha="left", color="white")
    ax.text(0.98, 0.5, f"{AUTHOR}  •  {ts}",
            fontsize=10,
            va="center", ha="right", color="#d0d0d0")

def draw_footer(fig, text="For academic/demo use only. Not medical advice."):
    ax = fig.add_axes([0.0, 0.0, 1.0, 0.035])
    ax.set_axis_off()
    ax.add_patch(Rectangle((0,0),1,1, transform=ax.transAxes,
                           color=PANEL_COLOR, alpha=1.0))
    ax.text(0.5, 0.5, text,
            fontsize=8.5,
            va="center", ha="center",
            color="#aaaaaa")

def draw_legend(fig):
    ax = fig.add_axes([0.02, 0.035, 0.22, 0.06])
    ax.set_axis_off()
    ax.add_patch(Rectangle((0,0),1,1,
                           transform=ax.transAxes,
                           color="black", alpha=0.35))
    ax.text(0.05, 0.62, "Legend",
            fontsize=9.5, fontweight="bold",
            va="center", ha="left", color="white")

    ax.add_patch(Rectangle((0.05,0.18),0.08,0.24,
                           transform=ax.transAxes,
                           color=(0.10, 0.75, 0.35)))
    ax.text(0.15, 0.30, "Not Cancer",
            fontsize=8.5,
            va="center", ha="left", color="white")

    ax.add_patch(Rectangle((0.55,0.18),0.08,0.24,
                           transform=ax.transAxes,
                           color=(0.88, 0.12, 0.15)))
    ax.text(0.65, 0.30, "Cancer",
            fontsize=8.5,
            va="center", ha="left", color="white")

def draw_card(ax, image, prob, name):
    ax.set_axis_off()
    ax.imshow(image)

    color = conf_color(prob)

    # Card border
    ax.add_patch(FancyBboxPatch(
        (0,0), 1, 1,
        transform=ax.transAxes,
        boxstyle="round,pad=0.012,rounding_size=0.032",
        fill=False, lw=3.5, edgecolor=color
    ))

    # Bottom info band
    band_h = 0.22
    ax.add_patch(Rectangle((0,0),1,band_h,
                           transform=ax.transAxes,
                           color="black", alpha=0.70, lw=0))

    label = "Cancer" if prob >= MALIGNANT_CUT else "Not Cancer"
    ax.text(0.03, 0.03,
            f"{label}  •  {fmt_pct(prob)}",
            transform=ax.transAxes,
            fontsize=12,
            fontweight="bold",
            va="bottom", ha="left",
            color="white",
            path_effects=[pe.withStroke(linewidth=2,
                                        foreground="black",
                                        alpha=0.6)])

    # Filename
    ax.text(0.97, 0.03,
            name[:26],
            transform=ax.transAxes,
            fontsize=8,
            va="bottom", ha="right",
            color="#e0e0e0",
            alpha=0.95)

    # Confidence bar
    bar_y = 0.03 + band_h * 0.45
    ax.add_patch(Rectangle((0.03, bar_y),
                           0.94, band_h*0.18,
                           transform=ax.transAxes,
                           fill=False, lw=1.3,
                           edgecolor="white"))
    ax.add_patch(Rectangle((0.03, bar_y),
                           0.94 * float(np.clip(prob, 0, 1)),
                           band_h*0.18,
                           transform=ax.transAxes,
                           color=color, alpha=0.95))

    # Ticks
    for t, txt in zip([0, 0.5, 1.0], ["0%", "50%", "100%"]):
        ax.text(0.03 + 0.94*t,
                bar_y + band_h*0.23,
                txt,
                transform=ax.transAxes,
                fontsize=7,
                ha="center", va="bottom",
                color="white", alpha=0.9)

    # Benign/Malignant text
    ax.text(0.03, bar_y - 0.07,
            f"Benign: {fmt_pct(1-prob)}",
            transform=ax.transAxes,
            fontsize=8,
            color="#b8f2c8" if prob < MALIGNANT_CUT else "#aaaaaa")
    ax.text(0.97, bar_y - 0.07,
            f"Malignant: {fmt_pct(prob)}",
            transform=ax.transAxes,
            fontsize=8,
            ha="right",
            color="#ffb3c1" if prob >= MALIGNANT_CUT else "#aaaaaa")

# ---------- Optional Grad-CAM (best-effort) ----------

def try_build_gradcam(model):
    try:
        backbone = model.layers[0]
        final = model.layers[-1]
        inp = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
        feat = backbone(inp, training=False)
        pooled = tf.keras.layers.GlobalAveragePooling2D()(feat)
        out = final(pooled)
        grad_model = tf.keras.Model(inp, [feat, out])

        def gradcam(x_batch):
            with tf.GradientTape() as tape:
                conv_out, preds = grad_model(x_batch, training=False)
                loss = preds[:, 0]
            grads = tape.gradient(loss, conv_out)
            w = tf.reduce_mean(grads, axis=(1,2), keepdims=True)
            cam = tf.reduce_sum(w * conv_out, axis=-1)
            cam = tf.nn.relu(cam)
            cam = cam / (tf.reduce_max(cam, axis=(1,2), keepdims=True) + 1e-8)
            cam = tf.image.resize(cam[..., None], (IMG_SIZE, IMG_SIZE))[:, :, :, 0]
            return cam.numpy()

        print("✅ Grad-CAM enabled.")
        return gradcam
    except Exception:
        print("ℹ️ Grad-CAM not enabled (model structure not compatible).")
        return None

# ---------- Layouts ----------

def plot_gallery(images, probs, names, save_path):
    n = min(len(images), MAX_IMAGES)
    if n == 0:
        return

    cols = 2
    rows = (n + cols - 1) // cols
    fig_h = rows * 4.8 + 2.8
    fig_w = cols * 5.3

    fig = plt.figure(figsize=(fig_w, fig_h))
    fig.patch.set_facecolor(BG_COLOR)

    draw_header(fig)
    draw_footer(fig)
    draw_legend(fig)

    top = 0.90
    bottom = 0.08
    grid_h = top - bottom
    cell_h = grid_h / rows
    cell_w = (1.0 - 0.10) / cols

    idx = 0
    for r in range(rows):
        for c in range(cols):
            if idx >= n:
                break
            x0 = 0.05 + c * cell_w
            y0 = top - (r+1)*cell_h
            ax = fig.add_axes([x0, y0+0.02, cell_w-0.02, cell_h-0.04])
            draw_card(ax, images[idx], probs[idx], names[idx])
            idx += 1

    plt.savefig(save_path, dpi=230, bbox_inches="tight")
    plt.show()
    print(f"✅ Gallery saved -> {save_path}")

def plot_risk_strip(images, probs, names, save_path):
    if len(images) == 0:
        return
    order = np.argsort(probs)[::-1][:min(3, len(images))]

    fig = plt.figure(figsize=(9, 2.8))
    fig.patch.set_facecolor(BG_COLOR)

    for i, idx in enumerate(order):
        ax = fig.add_subplot(1, len(order), i+1)
        ax.set_axis_off()
        ax.imshow(images[idx])

        ax.add_patch(Rectangle((0,0),1,0.28,
                               transform=ax.transAxes,
                               color="black", alpha=0.78, lw=0))

        ax.text(0.03, 0.04,
                f"#{i+1}  {names[idx][:20]}",
                transform=ax.transAxes,
                fontsize=8.5,
                va="bottom", ha="left",
                color="white",
                path_effects=[pe.withStroke(linewidth=1.2,
                                            foreground="black",
                                            alpha=0.7)])

        ax.text(0.97, 0.04,
                f"Malignant: {fmt_pct(probs[idx])}",
                transform=ax.transAxes,
                fontsize=9.5,
                va="bottom", ha="right",
                color="white",
                fontweight="bold")

        ax.add_patch(FancyBboxPatch(
            (0,0),1,1,
            transform=ax.transAxes,
            boxstyle="round,pad=0.01,rounding_size=0.03",
            fill=False, lw=3,
            edgecolor=conf_color(probs[idx])
        ))

    plt.tight_layout()
    plt.savefig(save_path, dpi=220, bbox_inches="tight")
    plt.show()
    print(f"✅ Risk strip saved -> {save_path}")

def plot_summary(probs, save_path):
    if len(probs) == 0:
        return

    probs = np.array(probs)
    preds = (probs >= MALIGNANT_CUT).astype(int)
    n_cancer = int(preds.sum())
    n_not = len(preds) - n_cancer
    avg_m = probs.mean() * 100

    fig = plt.figure(figsize=(8.5,3.6))
    fig.patch.set_facecolor(BG_COLOR)

    ax1 = fig.add_subplot(1,2,1)
    ax1.set_title("Prediction Breakdown",
                  fontsize=10.5, fontweight="bold", color="white")
    ax1.pie(
        [n_not, n_cancer],
        labels=["Not Cancer", "Cancer"],
        autopct="%1.0f%%",
        startangle=90,
        colors=[(0.10,0.75,0.35),(0.88,0.12,0.15)],
        textprops={"color":"white", "fontsize":8}
    )
    ax1.set_aspect("equal")

    ax2 = fig.add_subplot(1,2,2)
    ax2.set_title(f"Malignant Probability (avg: {avg_m:.1f}%)",
                  fontsize=10.5, fontweight="bold", color="white")
    ax2.hist(probs*100, bins=8, edgecolor="white")
    ax2.set_xlabel("% malignant", fontsize=8.5)
    ax2.set_ylabel("count", fontsize=8.5)
    ax2.tick_params(colors="white", labelsize=8)
    for s in ax2.spines.values():
        s.set_color("white")

    plt.tight_layout()
    plt.savefig(save_path, dpi=220, bbox_inches="tight")
    plt.show()
    print(f"✅ Summary saved -> {save_path}")

# ---------- 1) OPTIONAL: upload model ----------

model = None
gradcam_fn = None

print("🧠 Optional: Upload your trained model (.keras / .h5).")
print("   - If you don't upload or upload something else, demo mode will show UI with fake but stable probabilities.\n")

try:
    up_model = files.upload()
except Exception:
    up_model = {}

model_files = [n for n in up_model if n.lower().endswith((".keras",".h5"))] if up_model else []

if model_files:
    mname = model_files[0]
    with open(f"/content/{mname}", "wb") as f:
        f.write(up_model[mname])
    model = tf.keras.models.load_model(f"/content/{mname}")
    print(f"✅ Model loaded: {mname}")
    gradcam_fn = try_build_gradcam(model)
elif up_model:
    # Something uploaded, but not a model
    print("ℹ️ Uploaded file is not .keras/.h5. Ignoring and using demo mode.")
else:
    print("ℹ️ No model uploaded. Running in demo mode (UI showcase).")

# ---------- 2) Upload images ----------

print("\n📤 Upload 3–8 lesion images (JPG/PNG):")
uploaded = files.upload()
if not uploaded:
    raise SystemExit("No images uploaded.")

image_names = [n for n in uploaded if n.lower().endswith((".jpg",".jpeg",".png"))]
if not image_names:
    raise SystemExit("No JPG/PNG images in upload.")
image_names = image_names[:MAX_IMAGES]

# ---------- 3) Predict ----------

images = []
probs = []
rows = []

for name in image_names:
    data = uploaded[name]
    img = tf.io.decode_image(data, channels=3, expand_animations=False)
    img = tf.image.resize(img, [IMG_SIZE, IMG_SIZE])
    x = tf.cast(img, tf.float32) / 255.0

    if model is not None:
        # real model prediction
        pred = model(x[None, ...], training=False).numpy()
        p = float(np.clip(pred.ravel()[0], 0.0, 1.0))
    else:
        # demo: deterministic, decent-looking probability from filename
        seed = abs(hash(name)) % (2**32)
        rng = np.random.default_rng(seed)
        p = float(np.clip(rng.normal(0.55, 0.22), 0.05, 0.97))

    images.append(x.numpy())
    probs.append(p)

    label = "Cancer" if p >= MALIGNANT_CUT else "Not Cancer"
    rows.append((name, label, p*100.0, (1.0-p)*100.0))
    print(f"{name}: {label} ({p*100:.1f}%)")

# ---------- 4) Visualizations & Export ----------

os.makedirs("/content/cards", exist_ok=True)

gallery_path = "/content/pred_gallery.png"
risk_path    = "/content/risk_strip.png"
summary_path = "/content/summary_panel.png"
csv_path     = "/content/predictions.csv"
zip_path     = "/content/skin_cancer_outputs.zip"

plot_gallery(images, probs, image_names, gallery_path)
plot_risk_strip(images, probs, image_names, risk_path)
plot_summary(probs, summary_path)

df = pd.DataFrame(rows, columns=["filename", "prediction", "malignant_%", "benign_%"])
df.to_csv(csv_path, index=False)
print("\n📋 Prediction Table:")
print(df.to_string(index=False))
print(f"\n✅ CSV saved -> {csv_path}")

# Save individual cards
for i, (img, p, name) in enumerate(zip(images, probs, image_names), start=1):
    fig = plt.figure(figsize=(5,5))
    fig.patch.set_facecolor(BG_COLOR)
    ax = fig.add_axes([0,0,1,1]); ax.set_axis_off()
    draw_card(ax, img, p, name)
    out = f"/content/cards/card_{i:02d}.png"
    plt.savefig(out, dpi=230, bbox_inches="tight")
    plt.close(fig)

# Build ZIP (no auto-download)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for src, arc in [
        (gallery_path, "gallery.png"),
        (risk_path, "risk_strip.png"),
        (summary_path, "summary_panel.png"),
        (csv_path, "predictions.csv"),
    ]:
        if os.path.exists(src):
            z.write(src, arcname=arc)
    for f in sorted(os.listdir("/content/cards")):
        full = os.path.join("/content/cards", f)
        if os.path.isfile(full):
            z.write(full, arcname=f"cards/{f}")

print(f"\n📦 ZIP ready at: {zip_path}")

# Manual download button (click -> downloads ZIP, nothing auto)
zip_name = os.path.basename(zip_path)
display(HTML(f"""
<div style="margin-top:12px">
  <a href="/files/{zip_name}" download="{zip_name}">
    <button style="
      padding:10px 18px;
      background:#2563eb;
      color:white;
      border:none;
      border-radius:6px;
      font-size:14px;
      cursor:pointer;
    ">
      ⬇️ Download Results (ZIP)
    </button>
  </a>
</div>
"""))
