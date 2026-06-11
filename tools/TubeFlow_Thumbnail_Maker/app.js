const canvas = document.getElementById("thumbnailCanvas");
const ctx = canvas.getContext("2d");

const controls = {
  headline: document.getElementById("headlineInput"),
  subheadline: document.getElementById("subheadlineInput"),
  badge: document.getElementById("badgeInput"),
  person: document.getElementById("personInput"),
  logo: document.getElementById("logoInput"),
  screenshot: document.getElementById("screenshotInput"),
  layout: document.getElementById("layoutInput"),
  accent: document.getElementById("accentInput"),
  background: document.getElementById("backgroundInput"),
  download: document.getElementById("downloadBtn"),
  accessPreset: document.getElementById("accessPreset"),
  emailPreset: document.getElementById("emailPreset"),
  clearImages: document.getElementById("clearImages"),
};

const state = {
  personImage: null,
  logoImage: null,
  screenshotImage: null,
};

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fitRect(image, x, y, width, height, mode = "contain") {
  const scale =
    mode === "cover"
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  return {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawTextStroke(text, x, y, size, fill, align = "left") {
  ctx.save();
  ctx.font = `900 ${size}px Impact, Arial Black, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.26)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = Math.max(8, size * 0.08);
  ctx.strokeText(text.toUpperCase(), x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

function drawBackground() {
  const tone = controls.background.value;
  const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
  if (tone === "warm") {
    gradient.addColorStop(0, "#fffaf0");
    gradient.addColorStop(1, "#eceff5");
  } else if (tone === "white") {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#f4f6fa");
  } else {
    gradient.addColorStop(0, "#f9fafb");
    gradient.addColorStop(1, "#dfe4ec");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);
}

function drawLogo(isPersonRight) {
  const x = isPersonRight ? 42 : 1000;
  const y = 38;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 8;
  roundRect(x, y, 170, 170, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  if (state.logoImage) {
    const rect = fitRect(state.logoImage, x + 22, y + 22, 126, 126);
    ctx.drawImage(state.logoImage, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  ctx.save();
  ctx.fillStyle = "#0ea5e9";
  ctx.font = "900 74px Arial Black, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TF", x + 85, y + 88);
  ctx.restore();
}

function drawScreenshot(isPersonRight) {
  const x = isPersonRight ? 32 : 420;
  const y = 365;
  const width = 820;
  const height = 300;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  roundRect(x, y, width, height, 18);
  ctx.fillStyle = "#f5f7fb";
  ctx.fill();
  ctx.clip();
  if (state.screenshotImage) {
    const rect = fitRect(state.screenshotImage, x, y, width, height, "cover");
    ctx.drawImage(state.screenshotImage, rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#d9e0ea";
    for (let i = 0; i < 7; i += 1) {
      ctx.fillRect(x + 32, y + 36 + i * 34, width - 64, 16);
    }
    ctx.fillStyle = "#98a4b5";
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillText("SCREENSHOT", x + 42, y + 245);
  }
  ctx.restore();
}

function drawArrow(isPersonRight) {
  const accent = controls.accent.value;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 34;
  ctx.beginPath();
  if (isPersonRight) {
    ctx.moveTo(715, 245);
    ctx.bezierCurveTo(715, 390, 635, 460, 525, 520);
  } else {
    ctx.moveTo(575, 245);
    ctx.bezierCurveTo(575, 390, 645, 460, 760, 520);
  }
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 22;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  const head = isPersonRight
    ? [[500, 532], [568, 500], [550, 580]]
    : [[790, 532], [720, 500], [740, 580]];
  ctx.beginPath();
  ctx.moveTo(head[0][0], head[0][1]);
  ctx.lineTo(head[1][0], head[1][1]);
  ctx.lineTo(head[2][0], head[2][1]);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(head[0][0], head[0][1]);
  ctx.lineTo((head[1][0] * 0.65 + head[0][0] * 0.35), (head[1][1] * 0.65 + head[0][1] * 0.35));
  ctx.lineTo((head[2][0] * 0.65 + head[0][0] * 0.35), (head[2][1] * 0.65 + head[0][1] * 0.35));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPerson(isPersonRight) {
  const x = isPersonRight ? 830 : -30;
  const y = 28;
  const width = 490;
  const height = 700;

  if (state.personImage) {
    const rect = fitRect(state.personImage, x, y, width, height, "contain");
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(state.personImage, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.ellipse(0, 170, 175, 235, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c7a4";
  ctx.beginPath();
  ctx.ellipse(0, -80, 125, 155, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f1e15";
  ctx.beginPath();
  ctx.ellipse(0, -210, 135, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Upload", 0, -15);
  ctx.fillText("Person PNG", 0, 20);
  ctx.restore();
}

function drawBadge(isPersonRight) {
  const label = controls.badge.value.trim();
  if (!label) return;
  const x = isPersonRight ? 254 : 865;
  const y = 40;
  ctx.save();
  ctx.font = "800 26px Arial, sans-serif";
  const width = Math.min(360, Math.max(190, ctx.measureText(label).width + 42));
  roundRect(x, y, width, 52, 18);
  ctx.fillStyle = "#111827";
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(label.toUpperCase(), x + 22, y + 27);
  ctx.restore();
}

function draw() {
  const isPersonRight = controls.layout.value === "person-right";
  drawBackground();
  drawScreenshot(isPersonRight);
  drawLogo(isPersonRight);
  drawBadge(isPersonRight);

  const textX = isPersonRight ? 265 : 430;
  const headline = controls.headline.value || "COMBINE";
  const subheadline = controls.subheadline.value || "EMAIL";
  drawTextStroke(headline, textX, 64, 118, "#fff200");
  drawTextStroke(subheadline, textX, 198, 100, "#ffffff");

  drawArrow(isPersonRight);
  drawPerson(isPersonRight);
}

async function handleFileInput(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  state[key] = await loadImageFromFile(file);
  draw();
}

function downloadPng() {
  const fileName = `${controls.headline.value || "tubeflow"}-${controls.subheadline.value || "thumbnail"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${fileName || "tubeflow-thumbnail"}.png`;
  link.click();
}

function setPreset(headline, subheadline, badge) {
  controls.headline.value = headline;
  controls.subheadline.value = subheadline;
  controls.badge.value = badge;
  draw();
}

for (const input of [controls.headline, controls.subheadline, controls.badge, controls.layout, controls.accent, controls.background]) {
  input.addEventListener("input", draw);
}

controls.person.addEventListener("change", (event) => handleFileInput(event, "personImage"));
controls.logo.addEventListener("change", (event) => handleFileInput(event, "logoImage"));
controls.screenshot.addEventListener("change", (event) => handleFileInput(event, "screenshotImage"));
controls.download.addEventListener("click", downloadPng);
controls.accessPreset.addEventListener("click", () => setPreset("ACCESS", "APP ACCESS", "WINDOWS"));
controls.emailPreset.addEventListener("click", () => setPreset("COMBINE", "EMAIL", "GMAIL"));
controls.clearImages.addEventListener("click", () => {
  state.personImage = null;
  state.logoImage = null;
  state.screenshotImage = null;
  controls.person.value = "";
  controls.logo.value = "";
  controls.screenshot.value = "";
  draw();
});

draw();
