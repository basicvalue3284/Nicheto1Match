from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSET_DIR = ROOT / "doc_assets"
OUTPUT = ROOT / "TubeFlow_Local_Renderer_Windows_Install_and_Process.docx"


BLUE = RGBColor(46, 116, 181)
GREEN = RGBColor(34, 197, 94)
DARK = RGBColor(31, 41, 55)
MUTED = RGBColor(75, 85, 99)
LIGHT_FILL = "E8EEF5"


def font(size=24, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap_text(draw, text, width, font_obj):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font_obj)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_centered(draw, box, text, font_obj, fill=(17, 24, 39)):
    x1, y1, x2, y2 = box
    lines = wrap_text(draw, text, x2 - x1 - 24, font_obj)
    line_h = font_obj.size + 7
    total_h = len(lines) * line_h
    y = y1 + ((y2 - y1) - total_h) / 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_obj)
        x = x1 + ((x2 - x1) - (bbox[2] - bbox[0])) / 2
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += line_h


def make_flow_image(path):
    img = Image.new("RGB", (1500, 540), "white")
    d = ImageDraw.Draw(img)
    title = font(34, True)
    body = font(24, True)
    small = font(19)
    d.text((45, 34), "TubeFlow Local Renderer: Windows Setup Flow", font=title, fill=(17, 24, 39))
    boxes = [
        ("1", "Install Python", "Tick Add python.exe to PATH"),
        ("2", "Install FFmpeg", "Use winget install Gyan.FFmpeg"),
        ("3", "Copy renderer folder", r"C:\TubeFlow_Local_Renderer"),
        ("4", "Double-click BAT file", "Keep window open while working"),
        ("5", "Final MP4 appears", "03_Final_Output"),
    ]
    x, y, w, h, gap = 45, 145, 245, 210, 35
    for i, (num, headline, note) in enumerate(boxes):
        bx = x + i * (w + gap)
        d.rounded_rectangle((bx, y, bx + w, y + h), radius=18, fill=(248, 250, 252), outline=(203, 213, 225), width=3)
        d.ellipse((bx + 18, y + 18, bx + 60, y + 60), fill=(34, 197, 94))
        d.text((bx + 33, y + 25), num, font=font(22, True), fill="white")
        draw_centered(d, (bx + 18, y + 72, bx + w - 18, y + 132), headline, body)
        draw_centered(d, (bx + 18, y + 135, bx + w - 18, y + h - 18), note, small, fill=(75, 85, 99))
        if i < len(boxes) - 1:
            ax1, ay = bx + w + 8, y + h / 2
            ax2 = bx + w + gap - 8
            d.line((ax1, ay, ax2, ay), fill=(34, 197, 94), width=5)
            d.polygon([(ax2, ay), (ax2 - 14, ay - 10), (ax2 - 14, ay + 10)], fill=(34, 197, 94))
    path.parent.mkdir(exist_ok=True)
    img.save(path)


def make_folder_image(path):
    img = Image.new("RGB", (1500, 650), "white")
    d = ImageDraw.Draw(img)
    d.text((45, 34), "Folder Map: Where Files Go", font=font(34, True), fill=(17, 24, 39))
    rows = [
        ("01_Audio_1x", "TubeFlow 1x audio file", r"topic_name.mp3"),
        ("02_OBS_or_LosslessCut_Video", "OBS or trimmed LosslessCut video", r"topic_name.mp4"),
        ("03_Final_Output", "Final merged video to upload", r"topic_name_FINAL.mp4"),
        ("04_Processed_Raw_Video", "Raw video moves here after success", "Do not upload this"),
        ("05_Needs_Checking", "Failed file moves here", "Contact admin"),
    ]
    y = 125
    for folder, purpose, example in rows:
        d.rounded_rectangle((60, y, 1440, y + 78), radius=12, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
        d.rounded_rectangle((80, y + 17, 390, y + 61), radius=8, fill=(232, 238, 245), outline=(203, 213, 225))
        d.text((100, y + 28), folder, font=font(21, True), fill=(31, 78, 121))
        d.text((430, y + 22), purpose, font=font(22), fill=(17, 24, 39))
        d.text((990, y + 22), example, font=font(21), fill=(75, 85, 99))
        y += 92
    img.save(path)


def make_daily_image(path):
    img = Image.new("RGB", (1500, 690), "white")
    d = ImageDraw.Draw(img)
    d.text((45, 34), "Daily Video Process", font=font(34, True), fill=(17, 24, 39))
    steps = [
        ("Start renderer", "Double-click BAT"),
        ("Create in TubeFlow", "Download 1x audio"),
        ("Record OBS", "Audio plays at 1.5x"),
        ("Trim in LosslessCut", "Remove start/end delay"),
        ("Auto render", "Wait for Final video ready"),
        ("Upload final", "Use _FINAL.mp4 only"),
    ]
    x, y, w, h = 80, 130, 390, 130
    positions = [(80, 130), (555, 130), (1030, 130), (1030, 370), (555, 370), (80, 370)]
    for i, ((headline, note), (bx, by)) in enumerate(zip(steps, positions), start=1):
        d.rounded_rectangle((bx, by, bx + w, by + h), radius=18, fill=(248, 250, 252), outline=(203, 213, 225), width=3)
        d.ellipse((bx + 18, by + 31, bx + 82, by + 95), fill=(34, 197, 94))
        draw_centered(d, (bx + 18, by + 31, bx + 82, by + 95), str(i), font(26, True), fill="white")
        d.text((bx + 105, by + 31), headline, font=font(25, True), fill=(17, 24, 39))
        d.text((bx + 105, by + 68), note, font=font(22), fill=(75, 85, 99))
    arrows = [
        ((470, 195), (555, 195)),
        ((945, 195), (1030, 195)),
        ((1225, 260), (1225, 370)),
        ((1030, 435), (945, 435)),
        ((555, 435), (470, 435)),
    ]
    for (x1, y1), (x2, y2) in arrows:
        d.line((x1, y1, x2, y2), fill=(34, 197, 94), width=5)
        if x2 > x1:
            d.polygon([(x2, y2), (x2 - 14, y2 - 10), (x2 - 14, y2 + 10)], fill=(34, 197, 94))
        elif x2 < x1:
            d.polygon([(x2, y2), (x2 + 14, y2 - 10), (x2 + 14, y2 + 10)], fill=(34, 197, 94))
        else:
            d.polygon([(x2, y2), (x2 - 10, y2 - 14), (x2 + 10, y2 - 14)], fill=(34, 197, 94))
    img.save(path)


def shade_cell(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_text(cell, text, bold=False, color=None):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(10)
    r.bold = bold
    if color:
        r.font.color.rgb = color
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def add_hyperlink(paragraph, text, url):
    part = paragraph.part
    r_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)
    new_run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    r_pr.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.append(underline)
    new_run.append(r_pr)
    text_el = OxmlElement("w:t")
    text_el.text = text
    new_run.append(text_el)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)


def add_code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.22)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = DARK
    return p


def add_note(doc, text):
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    cell = table.cell(0, 0)
    shade_cell(cell, "EAF7EF")
    set_cell_text(cell, text, bold=False, color=DARK)
    table.rows[0].height = Inches(0.36)
    doc.add_paragraph()


def add_checklist(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(4)
        p.add_run(item)


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.space_after = Pt(4)
        p.add_run(item)


def setup_styles(doc):
    section = doc.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.top_margin = Inches(0.62)
    section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.65)
    section.right_margin = Inches(0.65)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    for name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 18, 10),
        ("Heading 2", 13, BLUE, 14, 7),
        ("Heading 3", 12, RGBColor(31, 77, 120), 10, 5),
    ]:
        style = styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.line_spacing = 1.25


def add_title(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run("TubeFlow Local Renderer")
    r.font.name = "Calibri"
    r.font.size = Pt(25)
    r.font.bold = True
    r.font.color.rgb = BLUE

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run("Windows install guide and daily merging process for freelancers")
    r.font.name = "Calibri"
    r.font.size = Pt(12)
    r.font.color.rgb = MUTED

    add_note(
        doc,
        "Purpose: Install the local renderer one time on Windows, then use it daily to merge TubeFlow 1x audio with OBS recordings made while listening at 1.5x.",
    )


def add_link_section(doc):
    doc.add_paragraph("Required Download Links", style="Heading 1")
    rows = [
        ("Python for Windows", "https://www.python.org/downloads/windows/", "Install Python and tick Add python.exe to PATH."),
        ("FFmpeg official download page", "https://ffmpeg.org/download.html", "Official FFmpeg download information."),
        ("Recommended FFmpeg Windows builds", "https://www.gyan.dev/ffmpeg/builds/", "Used by winget package Gyan.FFmpeg."),
        ("LosslessCut", "https://github.com/mifi/lossless-cut/releases", "Used to trim the start/end delay before final render."),
        ("OBS Studio", "https://obsproject.com/download", "Used for screen recording."),
        ("FFmpeg install video search", "https://www.youtube.com/results?search_query=install+ffmpeg+windows+11+add+to+path", "Use a recent tutorial if manual help is needed."),
    ]
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    headers = ["Tool", "Link", "Why Needed"]
    for i, header in enumerate(headers):
        shade_cell(table.rows[0].cells[i], LIGHT_FILL)
        set_cell_text(table.rows[0].cells[i], header, bold=True, color=DARK)
    for name, url, why in rows:
        cells = table.add_row().cells
        set_cell_text(cells[0], name, bold=True, color=DARK)
        cells[1].text = ""
        add_hyperlink(cells[1].paragraphs[0], url, url)
        set_cell_text(cells[2], why, color=DARK)


def add_setup_steps(doc):
    doc.add_paragraph("One-Time Windows Setup", style="Heading 1")
    doc.add_picture(str(ASSET_DIR / "setup_flow.png"), width=Inches(7.0))

    doc.add_paragraph("Step 1: Install Python", style="Heading 2")
    add_numbered(
        doc,
        [
            "Open the Python link from the Required Download Links table.",
            "Download the latest Python for Windows.",
            "On the first installer screen, tick Add python.exe to PATH.",
            "Click Install Now and wait until setup is complete.",
        ],
    )
    add_note(doc, "Do not skip Add python.exe to PATH. The renderer may not start if this is missed.")

    doc.add_paragraph("Step 2: Install FFmpeg", style="Heading 2")
    add_numbered(
        doc,
        [
            "Press the Windows key and search Command Prompt.",
            "Right-click Command Prompt and choose Run as administrator.",
            "Paste the command below and press Enter.",
        ],
    )
    add_code(doc, "winget install Gyan.FFmpeg")
    add_numbered(
        doc,
        [
            "When Windows asks for permission, accept it.",
            "After install finishes, close Command Prompt and open it again.",
            "Run the check command below.",
        ],
    )
    add_code(doc, "ffmpeg -version")
    add_note(doc, "If version details appear, FFmpeg is installed correctly. If Windows says ffmpeg is not recognized, contact admin.")

    doc.add_paragraph("Step 3: Copy The Renderer Folder", style="Heading 2")
    add_numbered(
        doc,
        [
            "Admin will share a folder named TubeFlow_Local_Renderer.",
            "Copy that full folder directly to C drive.",
            "The final location must be exactly:",
        ],
    )
    add_code(doc, r"C:\TubeFlow_Local_Renderer")
    add_checklist(doc, ["renderer.py", "config.json", "Start_TubeFlow_Renderer.bat"])

    doc.add_paragraph("Step 4: Create These Windows Folders", style="Heading 2")
    add_code(doc, r"C:\Users\<your-name>\Videos\LosslessCut")
    add_code(doc, r"C:\Users\<your-name>\Desktop\Ready_For_Google_Drive")
    doc.add_picture(str(ASSET_DIR / "folder_map.png"), width=Inches(7.0))

    doc.add_paragraph("Step 5: Start The Renderer", style="Heading 2")
    add_numbered(
        doc,
        [
            r"Open C:\TubeFlow_Local_Renderer.",
            "Double-click Start_TubeFlow_Renderer.bat.",
            "A black window opens.",
            "Keep this window open while working.",
        ],
    )
    add_code(doc, "Waiting for LosslessCut exports...")


def add_obs_settings(doc):
    doc.add_paragraph("OBS Recording Settings", style="Heading 1")
    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    for i, h in enumerate(["Setting", "Value"]):
        shade_cell(table.rows[0].cells[i], LIGHT_FILL)
        set_cell_text(table.rows[0].cells[i], h, bold=True, color=DARK)
    rows = [
        ("Base Canvas Resolution", "1920x1080"),
        ("Output Scaled Resolution", "1920x1080"),
        ("Downscale Filter", "Lanczos"),
        ("FPS", "30"),
        ("Recording Format", "MKV preferred, MP4 allowed if needed"),
        ("Video Encoder", "Hardware H.264 if available"),
        ("Rate Control", "CBR"),
        ("Bitrate", "15000 Kbps"),
        ("Keyframe Interval", "2 seconds"),
        ("Profile", "High"),
        ("Audio Sample Rate", "44.1 kHz"),
    ]
    for setting, value in rows:
        cells = table.add_row().cells
        set_cell_text(cells[0], setting, bold=True, color=DARK)
        set_cell_text(cells[1], value, color=DARK)
    add_note(doc, "OBS audio is only a rough reference. The renderer removes OBS audio and adds the clean TubeFlow 1x audio.")


def add_daily_process(doc):
    doc.add_paragraph("Daily Process For Every Video", style="Heading 1")
    doc.add_picture(str(ASSET_DIR / "daily_process.png"), width=Inches(7.0))

    doc.add_paragraph("1. Start Renderer Before Work", style="Heading 2")
    add_numbered(doc, [r"Open C:\TubeFlow_Local_Renderer.", "Double-click Start_TubeFlow_Renderer.bat.", "Keep the black window open."])

    doc.add_paragraph("2. Create Audio In TubeFlow", style="Heading 2")
    add_numbered(
        doc,
        [
            "Open TubeFlow Production Tool.",
            "Create the video topic.",
            "Generate script and audio.",
            "Click Download 1x Audio.",
            "Keep the downloaded audio in Downloads.",
        ],
    )
    add_note(doc, "Audio filename should clearly match the topic. Avoid generic names like audio.mp3 or download (4).mp3.")

    doc.add_paragraph("3. Record Screen In OBS", style="Heading 2")
    add_numbered(
        doc,
        [
            "Start OBS recording.",
            "In TubeFlow, click Start Recording.",
            "Listen to TubeFlow audio at 1.5x while recording the browser steps.",
            "Stop OBS when the task is complete.",
        ],
    )

    doc.add_paragraph("4. Trim In LosslessCut", style="Heading 2")
    add_numbered(
        doc,
        [
            "Open the OBS recording in LosslessCut.",
            "Trim the beginning delay.",
            "Trim the ending delay.",
            r"Export to C:\Users\<your-name>\Videos\LosslessCut.",
            "Name the video similar to the downloaded audio.",
        ],
    )

    doc.add_paragraph("5. Wait For Auto Merge", style="Heading 2")
    add_code(doc, "Found video\nMatched audio\nStarting FFmpeg render\nFinal video ready")
    add_note(doc, "Do not close the black renderer window while it says Starting FFmpeg render.")

    doc.add_paragraph("6. Upload Final File", style="Heading 2")
    add_numbered(
        doc,
        [
            r"Open C:\Users\<your-name>\Desktop\Ready_For_Google_Drive.",
            "Play the final video once.",
            "Upload only the file ending with _FINAL.mp4 to Google Drive.",
        ],
    )


def add_rules_and_help(doc):
    doc.add_paragraph("Important Rules", style="Heading 1")
    add_checklist(
        doc,
        [
            "Audio and video names must match the same topic.",
            "Always trim in LosslessCut before final render.",
            "Upload only the _FINAL.mp4 file.",
            "Do not upload raw OBS recordings.",
            "Do not upload files from Processed_By_TubeFlow.",
            "If anything looks wrong, stop and ask admin before creating more videos.",
        ],
    )

    doc.add_paragraph("Common Problems", style="Heading 1")
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    for i, h in enumerate(["Problem", "Likely Reason", "What To Do"]):
        shade_cell(table.rows[0].cells[i], LIGHT_FILL)
        set_cell_text(table.rows[0].cells[i], h, bold=True, color=DARK)
    rows = [
        ("FFmpeg not found", "FFmpeg was not installed or PATH did not update.", "Run ffmpeg -version. If it fails, contact admin."),
        ("Audio not found", "Audio filename does not match video topic.", "Check Downloads and rename carefully."),
        ("Final video not created", "Video moved to Needs_Admin_Help.", r"Check Videos\LosslessCut\Needs_Admin_Help and contact admin."),
        ("Wrong audio", "Wrong audio was downloaded or matched.", "Stop work and contact admin immediately."),
        ("Renderer closed", "Black window was closed.", "Open Start_TubeFlow_Renderer.bat again."),
    ]
    for problem, reason, fix in rows:
        cells = table.add_row().cells
        set_cell_text(cells[0], problem, bold=True, color=DARK)
        set_cell_text(cells[1], reason, color=DARK)
        set_cell_text(cells[2], fix, color=DARK)

    doc.add_paragraph("Final Quality Check", style="Heading 1")
    add_checklist(
        doc,
        [
            "Screen text is sharp.",
            "Audio is clean.",
            "Audio timing matches the screen action.",
            "Start delay is removed.",
            "End delay is removed.",
            "Filename ends with _FINAL.mp4.",
        ],
    )

    doc.add_paragraph("Admin Reference", style="Heading 1")
    add_code(
        doc,
        "Renderer output profile:\n"
        "Resolution: 1920x1080\n"
        "FPS: 30\n"
        "Video codec: H.264\n"
        "Speed correction: setpts=1.5*PTS\n"
        "Audio: AAC, 44.1 kHz, mono\n"
        "Final upload file: *_FINAL.mp4",
    )


def main():
    ASSET_DIR.mkdir(exist_ok=True)
    make_flow_image(ASSET_DIR / "setup_flow.png")
    make_folder_image(ASSET_DIR / "folder_map.png")
    make_daily_image(ASSET_DIR / "daily_process.png")

    doc = Document()
    setup_styles(doc)
    add_title(doc)
    add_link_section(doc)
    add_setup_steps(doc)
    add_obs_settings(doc)
    add_daily_process(doc)
    add_rules_and_help(doc)

    footer = doc.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("TubeFlow Local Renderer SOP - Windows")
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED

    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
