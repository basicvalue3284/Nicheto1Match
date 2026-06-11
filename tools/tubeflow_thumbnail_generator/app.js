const canvas = document.getElementById("thumbnailCanvas");
const ctx = canvas.getContext("2d");

const controls = {
  bulkTitles: document.getElementById("bulkTitlesInput"),
  ctrStyle: document.getElementById("ctrStyleInput"),
  generateText: document.getElementById("generateTextBtn"),
  saveAll: document.getElementById("saveAllBtn"),
  headline: document.getElementById("headlineInput"),
  subheadline: document.getElementById("subheadlineInput"),
  badge: document.getElementById("badgeInput"),
  fileName: document.getElementById("fileNameInput"),
  drivePath: document.getElementById("drivePathInput"),
  folderStatus: document.getElementById("folderStatus"),
  chooseFolder: document.getElementById("chooseFolderBtn"),
  saveFolder: document.getElementById("saveFolderBtn"),
  person: document.getElementById("personInput"),
  removePersonBg: document.getElementById("removePersonBgInput"),
  logo: document.getElementById("logoInput"),
  appName: document.getElementById("appNameInput"),
  accent: document.getElementById("accentInput"),
  autoAccent: document.getElementById("autoAccentInput"),
  textScale: document.getElementById("textScaleInput"),
  personScale: document.getElementById("personScaleInput"),
  personX: document.getElementById("personXInput"),
  personY: document.getElementById("personYInput"),
  arrow: document.getElementById("arrowInput"),
  download: document.getElementById("downloadBtn"),
  accessPreset: document.getElementById("accessPreset"),
  emailPreset: document.getElementById("emailPreset"),
  chromePreset: document.getElementById("chromePreset"),
  clearImages: document.getElementById("clearImages"),
};

const STORAGE_KEY = "tubeflow-thumbnail-dashboard-v1";

const state = {
  personImage: null,
  personSourceImage: null,
  personProcessedImage: null,
  personProcessedRemoveBg: null,
  logoImage: null,
  logoAccent: null,
  directoryHandle: null,
  isBatchSaving: false,
};

const actionWords = new Set([
  "access",
  "add",
  "automate",
  "build",
  "change",
  "combine",
  "connect",
  "create",
  "delete",
  "download",
  "edit",
  "export",
  "fix",
  "generate",
  "install",
  "make",
  "merge",
  "remove",
  "save",
  "setup",
  "speed",
  "sync",
  "upload",
  "use",
]);

const stopWords = new Set([
  "a",
  "an",
  "and",
  "app",
  "browser",
  "for",
  "from",
  "how",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "your",
]);

const knownApps = [
  "canva",
  "capcut",
  "chrome",
  "gmail",
  "google",
  "instagram",
  "notion",
  "outlook",
  "photoshop",
  "tiktok",
  "windows",
  "wordpress",
  "youtube",
];

const appAccentColors = {
  canva: "#28bfd0",
  capcut: "#22c55e",
  chrome: "#22c55e",
  gmail: "#ef4444",
  google: "#4285f4",
  instagram: "#e1306c",
  notion: "#111827",
  outlook: "#2563eb",
  photoshop: "#31a8ff",
  tiktok: "#ff2f5f",
  windows: "#2563eb",
  wordpress: "#21759b",
  youtube: "#ff0033",
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

function loadImageFromUrl(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
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

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseBulkTitles() {
  return controls.bulkTitles.value
    .split(/\n+/)
    .map((title) => title.trim())
    .filter(Boolean);
}

function detectAppName(title) {
  const words = tokenize(title);
  const known = knownApps.find((app) => words.includes(app));
  if (known) {
    return known === "capcut" ? "CapCut" : known.charAt(0).toUpperCase() + known.slice(1);
  }

  const cueIndex = words.findLastIndex((word) => ["in", "for", "with"].includes(word));
  const candidate = cueIndex >= 0 ? words.slice(cueIndex + 1).find((word) => !stopWords.has(word)) : "";
  return candidate ? candidate.charAt(0).toUpperCase() + candidate.slice(1) : controls.appName.value;
}

function chooseThumbnailWords(title, style) {
  const words = tokenize(title);
  const cleanWords = words.filter((word) => word !== "how");
  const actionIndex = cleanWords.findIndex((word) => actionWords.has(word));
  const action = actionIndex >= 0 ? cleanWords[actionIndex] : "";
  const afterAction = actionIndex >= 0 ? cleanWords.slice(actionIndex + 1) : cleanWords;
  const appName = detectAppName(title).toLowerCase();
  const objectWords = afterAction.filter((word) => {
    if (word === appName || word === "browser") return false;
    return !["in", "for", "from", "with"].includes(word);
  });
  const object = objectWords[0] || "tool";
  const secondObject = objectWords[1] || "";

  if (style === "problem") {
    const headline = action === "fix" && object ? `FIX ${object}` : action || "FIX";
    const support = objectWords.slice(headline.includes(object) ? 1 : 0, 3).join(" ") || "FAST";
    return {
      headline: headline.toUpperCase(),
      subheadline: support.toUpperCase(),
      badge: "AUTO THUMBNAIL",
    };
  }

  if (style === "speed") {
    const headline = action === "speed" ? "SPEED UP" : action || "FAST";
    const support = objectWords.filter((word) => word !== "up").slice(0, 3).join(" ") || appName || "RESULT";
    return {
      headline: headline.toUpperCase(),
      subheadline: support.toUpperCase(),
      badge: "AUTO THUMBNAIL",
    };
  }

  if (action === "fix" && object) {
    const support = objectWords.slice(1, 3).join(" ");
    return {
      headline: `FIX ${object}`.toUpperCase(),
      subheadline: (support === "pc" ? "IN PC" : support || "IN PC").toUpperCase(),
      badge: "AUTO THUMBNAIL",
    };
  }

  const supportWords = action === "add" && secondObject ? objectWords.slice(0, 3) : objectWords.filter((word) => word !== "to").slice(0, 2);
  return {
    headline: (action || object).toUpperCase(),
    subheadline: (supportWords.join(" ") || "STEP BY STEP").toUpperCase(),
    badge: "AUTO THUMBNAIL",
  };
}

function getAccentColor() {
  if (controls.autoAccent.checked && state.logoAccent) {
    return state.logoAccent;
  }
  return controls.accent.value;
}

function getTextMetrics(text, size) {
  ctx.save();
  ctx.font = `900 ${size}px Impact, Arial Black, Arial, sans-serif`;
  const metrics = ctx.measureText(text.toUpperCase());
  ctx.restore();
  return metrics;
}

function fitTextSize(text, baseSize, maxWidth) {
  let size = baseSize;
  while (size > 40 && getTextMetrics(text, size).width > maxWidth) {
    size -= 3;
  }
  return size;
}

function removeWhiteBackground(image) {
  const scratch = document.createElement("canvas");
  scratch.width = image.width;
  scratch.height = image.height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.drawImage(image, 0, 0);
  const imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
    if (red > 232 && green > 232 && blue > 232) {
      pixels[i + 3] = Math.max(0, distanceFromWhite * 4);
    }
  }

  scratchCtx.putImageData(imageData, 0, 0);
  return scratch;
}

function cropImageToContent(image) {
  const scratch = document.createElement("canvas");
  scratch.width = image.width;
  scratch.height = image.height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.drawImage(image, 0, 0);
  const pixels = scratchCtx.getImageData(0, 0, scratch.width, scratch.height).data;
  let minX = scratch.width;
  let minY = scratch.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      const index = (y * scratch.width + x) * 4;
      const alpha = pixels[index + 3];
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const isWhite = red > 244 && green > 244 && blue > 244;
      if (alpha > 24 && !isWhite) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return image;

  const padding = 8;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const width = Math.min(scratch.width - x, maxX - minX + padding * 2);
  const height = Math.min(scratch.height - y, maxY - minY + padding * 2);
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  cropped.getContext("2d").drawImage(image, x, y, width, height, 0, 0, width, height);
  return cropped;
}

function getPersonImage() {
  if (!state.personSourceImage) return null;
  if (state.personProcessedImage && state.personProcessedRemoveBg === controls.removePersonBg.checked) {
    return state.personProcessedImage;
  }
  const image = controls.removePersonBg.checked ? removeWhiteBackground(state.personSourceImage) : state.personSourceImage;
  state.personProcessedImage = cropImageToContent(image);
  state.personProcessedRemoveBg = controls.removePersonBg.checked;
  return state.personProcessedImage;
}

function drawTextStroke(text, x, y, size, fill, maxWidth = 560) {
  const normalized = text.toUpperCase();
  const fittedSize = fitTextSize(normalized, size, maxWidth);
  ctx.save();
  ctx.font = `900 ${fittedSize}px Impact, Arial Black, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.72)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 9;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(10, fittedSize * 0.13);
  ctx.strokeText(normalized, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(normalized, x, y);
  ctx.restore();
}

function drawDashboardBackground(accent) {
  const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
  gradient.addColorStop(0, "#11345e");
  gradient.addColorStop(0.45, "#07111f");
  gradient.addColorStop(1, "#050912");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);

  ctx.save();
  const glow = ctx.createRadialGradient(200, 600, 20, 200, 600, 500);
  glow.addColorStop(0, rgba(accent, 0.36));
  glow.addColorStop(0.45, rgba(accent, 0.14));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 1.25;
  for (let y = 80; y <= 680; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1280, y);
    ctx.stroke();
  }
  for (let x = -200; x <= 1220; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 280, 720);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = 0.8;
  for (let x = -120; x <= 520; x += 130) {
    ctx.beginPath();
    ctx.moveTo(x, 430);
    ctx.lineTo(x + 110, 720);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "rgba(5,10,18,0.56)";
  ctx.fillRect(0, 430, 930, 290);
}

function drawLogo(accent) {
  const x = 78;
  const y = 468;
  const size = 248;
  ctx.save();
  ctx.shadowColor = rgba(accent, 0.38);
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  roundRect(x, y, size, size, 44);
  ctx.fillStyle = "#eef3fa";
  ctx.fill();
  ctx.restore();

  if (state.logoImage) {
    const rect = fitRect(state.logoImage, x + 22, y + 22, size - 44, size - 44, "contain");
    ctx.drawImage(state.logoImage, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  const label = controls.appName.value.trim() || "App";
  const shortLabel = label.length <= 8 ? label : label.slice(0, 2).toUpperCase();
  let fontSize = shortLabel.length > 3 ? 52 : 76;
  ctx.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
  while (fontSize > 34 && ctx.measureText(shortLabel).width > 180) {
    fontSize -= 3;
    ctx.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
  }
  ctx.save();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(shortLabel, x + size / 2, y + size / 2 + 3);
  ctx.restore();
}

function drawArrow(accent) {
  if (!controls.arrow.checked) return;

  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "#eef3fa";
  ctx.lineWidth = 36;
  ctx.beginPath();
  ctx.moveTo(690, 395);
  ctx.lineTo(478, 540);
  ctx.lineTo(510, 488);
  ctx.stroke();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.moveTo(690, 395);
  ctx.lineTo(490, 534);
  ctx.lineTo(516, 492);
  ctx.stroke();

  ctx.fillStyle = "#eef3fa";
  ctx.beginPath();
  ctx.moveTo(430, 574);
  ctx.lineTo(515, 542);
  ctx.lineTo(505, 626);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(462, 574);
  ctx.lineTo(502, 558);
  ctx.lineTo(500, 600);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPerson() {
  const personImage = getPersonImage();
  if (personImage) {
    const scale = Number(controls.personScale.value) / 100;
    const x = 700 + Number(controls.personX.value);
    const y = -10 + Number(controls.personY.value);
    const width = 590 * scale;
    const height = 735 * scale;
    const rect = fitRect(personImage, x, y, width, height, "contain");
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.22)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = -8;
    ctx.drawImage(personImage, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.ellipse(1040, 325, 200, 245, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(930, 438, 295, 350, 34);
  ctx.fill();

  ctx.fillStyle = "#efb585";
  ctx.beginPath();
  ctx.ellipse(1045, 280, 165, 175, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(890, 286, 30, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1200, 286, 30, 44, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2d1a12";
  ctx.beginPath();
  ctx.ellipse(1005, 130, 130, 90, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1115, 130, 135, 90, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(900, 150, 320, 82);

  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(1004, 278, 19, 0, Math.PI * 2);
  ctx.arc(1118, 278, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(1002, 273, 6, 0, Math.PI * 2);
  ctx.arc(1116, 273, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3a1721";
  ctx.beginPath();
  ctx.ellipse(1065, 365, 30, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7d86";
  ctx.beginPath();
  ctx.ellipse(1065, 383, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#efb585";
  ctx.lineWidth = 60;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(930, 525);
  ctx.lineTo(795, 440);
  ctx.lineTo(845, 360);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(795, 440, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBadge() {
  const label = controls.badge.value.trim();
  if (!label) return;
  ctx.save();
  ctx.font = "800 26px Arial, sans-serif";
  const width = Math.min(350, Math.max(225, ctx.measureText(label).width + 48));
  roundRect(80, 350, width, 52, 20);
  ctx.fillStyle = "rgba(6,12,22,0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e8eef8";
  ctx.textBaseline = "middle";
  ctx.fillText(label.toUpperCase(), 106, 378);
  ctx.restore();
}

function draw() {
  const accent = getAccentColor();
  const textScale = Number(controls.textScale.value) / 100;
  drawDashboardBackground(accent);
  drawTextStroke(controls.headline.value || "REMOVE", 80, 78, 90 * textScale, "#fff200", 580);
  drawTextStroke(controls.subheadline.value || "WATERMARK", 80, 168, 76 * textScale, "#ffffff", 590);
  drawBadge();
  drawArrow(accent);
  drawLogo(accent);
  drawPerson();
  saveSettings();
}

async function extractAccentFromImage(image) {
  const scratch = document.createElement("canvas");
  scratch.width = 64;
  scratch.height = 64;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.clearRect(0, 0, 64, 64);
  const rect = fitRect(image, 0, 0, 64, 64, "contain");
  scratchCtx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  const pixels = scratchCtx.getImageData(0, 0, 64, 64).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 120) continue;
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const brightness = (red + green + blue) / 3;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (brightness > 235 || brightness < 35 || saturation < 25) continue;
    r += red;
    g += green;
    b += blue;
    count += 1;
  }

  if (!count) return null;
  return rgbToHex({
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  });
}

async function handleFileInput(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = await loadImageFromFile(file);
  state[key] = image;
  if (key === "personSourceImage") {
    state.personImage = image;
    state.personProcessedImage = null;
    state.personProcessedRemoveBg = null;
  }
  if (key === "logoImage") {
    state.logoAccent = await extractAccentFromImage(state.logoImage);
    if (state.logoAccent && controls.autoAccent.checked) {
      controls.accent.value = state.logoAccent;
    }
  }
  draw();
}

function canvasToBlob() {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

function setFolderStatus(message) {
  controls.folderStatus.textContent = message;
}

async function chooseDriveFolder() {
  if (!window.showDirectoryPicker) {
    setFolderStatus("Direct folder saving needs Chrome or Edge. Use Download PNG, then move it to your Google Drive folder.");
    return;
  }

  try {
    state.directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    setFolderStatus(`Selected folder: ${state.directoryHandle.name}. Bulk PNGs can be saved directly here.`);
  } catch {
    setFolderStatus("Folder was not selected. Use Download PNG or choose the folder again.");
  }
}

async function saveCanvasFile(fileName) {
  if (!state.directoryHandle) {
    await chooseDriveFolder();
  }
  if (!state.directoryHandle) return false;

  const fileHandle = await state.directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const blob = await canvasToBlob();
  await writable.write(blob);
  await writable.close();
  return true;
}

function applyTitle(title) {
  const generated = chooseThumbnailWords(title || "TubeFlow thumbnail", controls.ctrStyle.value);
  const detectedAppName = detectAppName(title || controls.appName.value);
  const detectedAccent = appAccentColors[detectedAppName.toLowerCase()];
  controls.headline.value = generated.headline;
  controls.subheadline.value = generated.subheadline;
  controls.badge.value = generated.badge;
  controls.fileName.value = slugify(title || `${generated.headline}-${generated.subheadline}`);
  controls.appName.value = detectedAppName;
  if (!state.logoImage && controls.autoAccent.checked && detectedAccent) {
    controls.accent.value = detectedAccent;
  }
  draw();
}

function previewFirstTitle() {
  const [firstTitle] = parseBulkTitles();
  applyTitle(firstTitle || "How to remove watermark in Canva");
}

async function saveToDriveFolder() {
  const fallbackName = `${controls.headline.value || "tubeflow"}-${controls.subheadline.value || "thumbnail"}`;
  const fileName = `${slugify(controls.fileName.value || fallbackName) || "tubeflow-thumbnail"}.png`;
  try {
    const saved = await saveCanvasFile(fileName);
    if (saved) {
      setFolderStatus(`Saved: ${state.directoryHandle.name}/${fileName}`);
    }
  } catch {
    setFolderStatus("Could not save to the selected folder. Use Download PNG as backup.");
  }
}

async function saveAllToDriveFolder() {
  const titles = parseBulkTitles();
  if (!titles.length) {
    setFolderStatus("Paste one title per line before bulk saving.");
    return;
  }

  state.isBatchSaving = true;
  controls.saveAll.disabled = true;
  try {
    if (!state.directoryHandle) {
      await chooseDriveFolder();
    }
    if (!state.directoryHandle) return;

    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index];
      applyTitle(title);
      const fileName = `${String(index + 1).padStart(2, "0")}-${slugify(title) || "thumbnail"}.png`;
      await saveCanvasFile(fileName);
      setFolderStatus(`Saved ${index + 1}/${titles.length}: ${fileName}`);
    }
    setFolderStatus(`Done. Saved ${titles.length} thumbnails to ${state.directoryHandle.name}.`);
  } catch {
    setFolderStatus("Bulk save stopped. Check folder permission and try again.");
  } finally {
    state.isBatchSaving = false;
    controls.saveAll.disabled = false;
  }
}

function downloadPng() {
  const fallbackName = `${controls.headline.value || "tubeflow"}-${controls.subheadline.value || "thumbnail"}`;
  const fileName = slugify(controls.fileName.value || fallbackName);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${fileName || "tubeflow-thumbnail"}.png`;
  link.click();
}

function setPreset(title, appName, accent) {
  controls.bulkTitles.value = title;
  controls.appName.value = appName;
  controls.accent.value = accent;
  previewFirstTitle();
}

function saveSettings() {
  if (state.isBatchSaving) return;
  const settings = {
    headline: controls.headline.value,
    subheadline: controls.subheadline.value,
    badge: controls.badge.value,
    fileName: controls.fileName.value,
    bulkTitles: controls.bulkTitles.value,
    ctrStyle: controls.ctrStyle.value,
    drivePath: controls.drivePath.value,
    appName: controls.appName.value,
    accent: controls.accent.value,
    autoAccent: controls.autoAccent.checked,
    textScale: controls.textScale.value,
    personScale: controls.personScale.value,
    personX: controls.personX.value,
    personY: controls.personY.value,
    removePersonBg: controls.removePersonBg.checked,
    arrow: controls.arrow.checked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function restoreSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const settings = JSON.parse(saved);
    for (const [key, value] of Object.entries(settings)) {
      if (!controls[key]) continue;
      if (controls[key].type === "checkbox") {
        controls[key].checked = Boolean(value);
      } else {
        controls[key].value = value;
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

for (const input of [
  controls.bulkTitles,
  controls.ctrStyle,
  controls.headline,
  controls.subheadline,
  controls.badge,
  controls.fileName,
  controls.drivePath,
  controls.appName,
  controls.accent,
  controls.autoAccent,
  controls.textScale,
  controls.personScale,
  controls.personX,
  controls.personY,
  controls.removePersonBg,
  controls.arrow,
]) {
  input.addEventListener("input", draw);
}

controls.person.addEventListener("change", (event) => handleFileInput(event, "personSourceImage"));
controls.logo.addEventListener("change", (event) => handleFileInput(event, "logoImage"));
controls.generateText.addEventListener("click", previewFirstTitle);
controls.download.addEventListener("click", downloadPng);
controls.chooseFolder.addEventListener("click", chooseDriveFolder);
controls.saveFolder.addEventListener("click", saveToDriveFolder);
controls.saveAll.addEventListener("click", saveAllToDriveFolder);
controls.accessPreset.addEventListener("click", () => setPreset("How to access app permissions in Windows", "Windows", "#2563eb"));
controls.emailPreset.addEventListener("click", () => setPreset("How to combine email accounts in Gmail", "Gmail", "#ef4444"));
controls.chromePreset.addEventListener("click", () => setPreset("How to install Chrome extension", "Chrome", "#22c55e"));
controls.clearImages.addEventListener("click", () => {
  state.personSourceImage = null;
  state.personImage = null;
  state.personProcessedImage = null;
  state.personProcessedRemoveBg = null;
  state.logoImage = null;
  state.logoAccent = null;
  controls.person.value = "";
  controls.logo.value = "";
  loadDefaultPerson();
});

async function loadDefaultPerson() {
  try {
    state.personSourceImage = await loadImageFromUrl("./assets/person_default_cutout.png");
    state.personProcessedImage = null;
    state.personProcessedRemoveBg = null;
  } catch {
    state.personSourceImage = null;
  }
  previewFirstTitle();
}

restoreSettings();
loadDefaultPerson();
