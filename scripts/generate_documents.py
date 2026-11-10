"""Build the downloadable press kit and its exact page previews.

Run from any directory: python scripts/generate_documents.py
Requires PyMuPDF and Pillow. All content comes from content/profile.json.
"""
from pathlib import Path
import io
import json
import zipfile
from html import escape
import fitz

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'documents'
OUT.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT / 'content/profile.json').read_text(encoding='utf-8'))
INK = '#16140f'
PAPER = '#f7f5f0'
RED = '#e4482a'
MUTED = '#6b655a'
LINE = '#ddd8cd'
WHITE = '#fffefb'


def rgb(color):
    return tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))


# Embed fonts in the PDF. The fallback also works on non-Windows machines.
fonts_dir = Path('C:/Windows/Fonts')
FONTS = {}
for key, filename, fallback in [('body', 'arial.ttf', 'helv'), ('bold', 'arialbd.ttf', 'hebo'), ('mono', 'consola.ttf', 'cour')]:
    font_path = fonts_dir / filename
    FONTS[key] = fitz.Font(fontfile=str(font_path)) if font_path.exists() else fitz.Font(fallback)


def box(page, x, y, w, h, fill, stroke=None):
    page.draw_rect(fitz.Rect(x, y, x + w, y + h), color=rgb(stroke) if stroke else None, fill=rgb(fill))


def rule(page, x, y, w, color=LINE):
    page.draw_line((x, y), (x + w, y), color=rgb(color), width=.6)


def text(page, x, y, value, size=10, width=515, font='body', color=INK, leading=1.45):
    """Place wrapped text, returning the next free y coordinate; fail on overflow."""
    font_obj = FONTS[font]
    name = 'Doc' + font
    page.insert_font(fontname=name, fontbuffer=font_obj.buffer)
    lines = []
    for paragraph in str(value).split('\n'):
        line = ''
        for word in paragraph.split():
            candidate = (line + ' ' + word).strip()
            if line and font_obj.text_length(candidate, fontsize=size) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    for line in lines:
        if y + size > page.rect.height - (10 if page.rect.height < 200 else 23):
            raise ValueError(f'Text overflow on page {page.number + 1}: {line}')
        page.insert_text((x, y + size), line, fontsize=size, fontname=name, color=rgb(color))
        y += size * leading
    return y


def label(page, x, y, value, width=515, color=RED):
    return text(page, x, y, value.upper(), 8, width, 'mono', color)


def link(page, x, y, title, uri, size=9, color=RED, width=515, font='body'):
    end = text(page, x, y, title, size, width, font=font, color=color)
    page.insert_link({'kind': fitz.LINK_URI, 'from': fitz.Rect(x, y, x + min(width, FONTS[font].text_length(title, fontsize=size)), end), 'uri': uri})
    return end


def certificate_date(cert):
    return '/'.join(reversed(cert['date'].split('-')))


def certificate_hours(cert):
    return str(cert['hours']).replace('.', ',') + ' h'


def prepare_certifications():
    """Render the original certificates and update the static website section."""
    from PIL import Image
    cards = []
    for cert in DATA.get('certifications', []):
        pdf = ROOT / cert['file']
        preview = pdf.with_suffix('.webp')
        with fitz.open(pdf) as original:
            page = original[0]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1280 / page.rect.width, 1280 / page.rect.width), alpha=False)
            Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples).save(preview, format='WEBP', quality=90)
        cert['preview'] = preview.relative_to(ROOT).as_posix()
        title, url, file, src = (escape(cert[key], quote=True) for key in ['title', 'url', 'file', 'preview'])
        cards.append(f'''            <article class="certificate-card" id="certificate-{escape(cert['id'])}">
              <span class="doc-eyebrow">{escape(cert['category'])}</span>
              <h4>{title}</h4>
              <p class="certificate-meta">{escape(cert['issuer'])} · <time datetime="{cert['date']}">{certificate_date(cert)}</time> · {certificate_hours(cert)}</p>
              <p class="certificate-instructor">Formateur : {escape(cert['instructor'])}</p>
              <div class="certificate-actions">
                <button class="doc-text-link" data-certificate data-prev-type="image" data-prev-src="{src}" data-prev-url="{url}" data-prev-action="Vérifier sur Udemy"><i class="fas fa-eye" aria-hidden="true"></i> Aperçu</button>
                <a class="doc-text-link" href="{file}" download><i class="fas fa-arrow-down" aria-hidden="true"></i> PDF</a>
                <a class="doc-text-link" href="{url}" target="_blank" rel="noopener">Vérifier sur Udemy <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
              </div>
            </article>''')
    if not cards:
        return
    total = sum(cert['hours'] for cert in DATA['certifications'])
    html = f'''        <div class="certifications" id="certifications" aria-labelledby="certificationsTitle">
          <div class="certifications-heading">
            <h3 id="certificationsTitle">Certifications & formation continue</h3>
            <p>{len(cards)} certificats de fin de formation · {total:g} h de cours · Udemy</p>
          </div>
          <div class="certificate-grid">
{chr(10).join(cards)}
          </div>
        </div>'''
    index = ROOT / 'index.html'
    source = index.read_text(encoding='utf-8')
    start, end = '<!-- CERTIFICATIONS:START -->', '<!-- CERTIFICATIONS:END -->'
    before, remaining = source.split(start, 1)
    _, after = remaining.split(end, 1)
    index.write_text(before + start + '\n' + html + '\n        ' + end + after, encoding='utf-8')


def project_link(project):
    """Prefer a project's live URL, otherwise open its own site preview."""
    if project.get('url'):
        return 'Voir en ligne', project['url']
    return 'Voir l’aperçu sur le site', DATA['website'] + '#project-' + project['id']


def new_page(doc, kind, number, title=None, subtitle=None):
    page = doc.new_page(width=595.276, height=841.89)
    box(page, 0, 0, page.rect.width, page.rect.height, PAPER)
    box(page, 40, 36, 7, 7, RED)
    label(page, 55, 33, 'Nabil Ould-Terki', color=INK)
    label(page, 370, 33, kind, width=190, color=MUTED)
    rule(page, 40, 58, 515)
    if title:
        y = text(page, 40, 83, title, 32, 515, 'bold', leading=1.15)
        if subtitle:
            text(page, 40, y + 12, subtitle, 10.5, 495, color=MUTED)
    rule(page, 40, 794, 515)
    link(page, 40, 805, 'usernabil.github.io/mypresentation', DATA['website'], size=7.5, color=MUTED)
    text(page, 480, 805, f'{number:02d} / {kind}', 7.5, 80, 'mono', MUTED)
    return page


def section(page, x, y, title, width=515):
    label(page, x, y, title, width)
    rule(page, x, y + 19, width)
    return y + 31


def image(page, path, rect):
    # PyMuPDF handles PNG/JPEG; use Pillow to select a representative GIF frame.
    from PIL import Image
    with Image.open(ROOT / path) as source:
        try:
            source.seek(min(12, getattr(source, 'n_frames', 1) - 1))
        except EOFError:
            source.seek(0)
        frame = source.convert('RGB')
        buffer = io.BytesIO()
        frame.save(buffer, format='JPEG', quality=88)
    page.insert_image(fitz.Rect(rect), stream=buffer.getvalue(), keep_proportion=True)


def portrait(page, x, y, size, border=LINE):
    """Place the existing site portrait as a small, framed document signature."""
    photo = fitz.Pixmap(str(ROOT / 'assets' / 'img' / 'portrait.png'))
    # Keep ample print resolution without embedding the full-size website image.
    while max(photo.width, photo.height) > 640:
        photo.shrink(1)
    if photo.alpha:
        photo = fitz.Pixmap(photo, 0)
    box(page, x - 3, y - 3, size + 6, size + 6, PAPER, border)
    page.insert_image(fitz.Rect(x, y, x + size, y + size), stream=photo.tobytes('jpeg', jpg_quality=88), keep_proportion=True)


def contacts(page, y, x=40, width=515):
    link(page, x, y, DATA['email'], 'mailto:' + DATA['email'], 9, width=width)
    text(page, x + 220, y, DATA['phone'] + '  ·  Paris', 9, width - 220, color=MUTED)


def build_cv():
    doc = fitz.open()
    p = new_page(doc, 'CV', 1)
    label(p, 40, 81, 'Ingénieur logiciel / Web & Mobile')
    text(p, 40, 108, 'Nabil\nOULD-TERKI.', 35, font='bold', leading=1.1)
    portrait(p, 479, 105, 76)
    box(p, 40, 204, 515, 29, INK)
    text(p, 52, 212, 'En CDI chez GRANITE depuis mai 2024', 9, 495, 'mono', PAPER)
    contacts(p, 248)
    link(p, 40, 270, 'LinkedIn', DATA['linkedin'], 8)
    link(p, 105, 270, 'GitHub / UserNabil', DATA['github'], 8)
    y = section(p, 40, 288, '01 / Expériences', 324)
    for exp in DATA['experience']:
        y = label(p, 40, y, exp['dates'], 324)
        y = text(p, 40, y + 4, exp['company'], 13, 324, 'bold')
        y = text(p, 40, y + 1, exp['role'], 9.2, 324, color=MUTED)
        for detail in exp['details']:
            y = text(p, 40, y + 7, detail, 9.1, 324)
        y = text(p, 40, y + 7, exp['stack'], 8, 324, 'mono', RED) + 20
    x, w = 391, 164
    y = section(p, x, 288, 'Profil', w)
    y = text(p, x, y, DATA['summary'], 9.2, w, color=MUTED)
    y = section(p, x, y + 25, 'Formation', w)
    for edu in DATA['education']:
        y = label(p, x, y, edu['dates'], w)
        y = text(p, x, y + 4, edu['title'], 9.5, w, 'bold')
        y = text(p, x, y + 3, edu['school'], 8.8, w, color=MUTED) + 15
    y = section(p, x, y + 7, 'Langues', w)
    text(p, x, y, 'Français\nAnglais · TOEIC validé', 9.2, w, color=MUTED)

    p = new_page(doc, 'CV', 2, 'Du produit au code.', 'Compétences, formation continue et réalisations sélectionnées.')
    y = section(p, 40, 168, '02 / Compétences')
    for i, skill in enumerate(DATA['skills']):
        x = 40 + (i % 2) * 272
        sy = y + (i // 2) * 48
        text(p, x, sy, skill['label'], 11, 245, 'bold')
        text(p, x, sy + 20, skill['value'], 9.3, 240, color=MUTED)
    y = section(p, 40, 350, '03 / Certificats de formation · Udemy')
    for i, cert in enumerate(DATA.get('certifications', [])):
        x = 40 + (i % 2) * 272
        sy = y + (i // 2) * 56
        end = link(p, x, sy, cert['title'], cert['url'], 9, width=240, font='bold')
        text(p, x, end + 3, certificate_date(cert) + ' · ' + certificate_hours(cert), 8, 240, 'mono', MUTED)
    y = section(p, 40, 550, '04 / Réalisations · Liens cliquables')
    for i, project in enumerate(DATA['projects']):
        x = 40 + (i % 2) * 272
        sy = y + (i // 2) * 55
        _, uri = project_link(project)
        link(p, x, sy, project['name'], uri, 11.5, width=245, font='bold')
        text(p, x, sy + 21, project['cv_summary'], 8.7, 240)
    link(p, 40, 768, 'Démos, liens et portfolio complet sur mon site', DATA['website'], 9)
    return doc


def build_profile():
    doc = fitz.open()
    p = new_page(doc, 'PROFIL', 1)
    label(p, 40, 87, 'Fiche de présentation')
    text(p, 40, 119, 'Une idée.\nUn produit.\nDu concret.', 43, font='bold', leading=1.06)
    portrait(p, 473, 182, 82)
    box(p, 40, 280, 42, 4, RED)
    text(p, 40, 310, DATA['name'], 22, font='bold')
    text(p, 40, 345, DATA['role'], 13, color=MUTED)
    text(p, 40, 389, DATA['summary'], 12, 510)
    y = section(p, 40, 506, 'Ce que je construis')
    items = [('Web & SaaS', 'Applications métier, CRM, back-offices et API.'), ('Mobile', 'Apps Flutter iOS/Android, de Figma à la publication.'), ('Produits & R&D', 'Jeux, marketplace et outils desktop.')]
    for i, (title, desc) in enumerate(items):
        sy = y + i * 47
        text(p, 40, sy, title, 11, 163, 'bold')
        text(p, 215, sy, desc, 10, 340, color=MUTED)
    box(p, 40, 699, 515, 34, INK)
    text(p, 52, 710, 'En CDI chez GRANITE depuis mai 2024', 9, 491, color=PAPER)
    contacts(p, 755)
    link(p, 40, 775, 'LinkedIn', DATA['linkedin'], 8)
    link(p, 105, 775, 'GitHub / UserNabil', DATA['github'], 8)
    return doc


def build_card():
    doc = fitz.open()
    # True trim dimensions: 85 x 55 mm; one PDF page per side.
    width, height = 85 / 25.4 * 72, 55 / 25.4 * 72
    p = doc.new_page(width=width, height=height)
    box(p, 0, 0, width, height, INK)
    box(p, 17, 18, 6, 6, RED)
    text(p, 31, 17, 'WEB / MOBILE / PRODUITS', 6, 192, 'mono', PAPER)
    text(p, 17, 49, 'Nabil\nOULD-TERKI.', 24, 210, 'bold', PAPER, 1.08)
    portrait(p, 190, 62, 34, border='#484339')
    rule(p, 17, 120, 207, '#484339')
    text(p, 17, 131, 'Ingénieur logiciel Full Stack & Mobile', 7, 210, color=PAPER)
    p = doc.new_page(width=width, height=height)
    box(p, 0, 0, width, height, PAPER)
    label(p, 17, 17, 'Parlons de votre projet.', 210)
    link(p, 17, 47, DATA['email'], 'mailto:' + DATA['email'], 9.5, color=INK, width=210)
    link(p, 17, 68, DATA['phone'], 'tel:+33641405237', 9.5, color=INK, width=210)
    text(p, 17, 89, 'Paris, France', 8, 210, color=MUTED)
    rule(p, 17, 112, 207)
    link(p, 17, 125, 'usernabil.github.io/mypresentation', DATA['website'], 7.1, width=210)
    return doc


def portfolio_card(p, project, x, y, w, image_height=132):
    box(p, x, y, w, image_height, '#e9e4da')
    if project['image']:
        image(p, project['image'], (x + 6, y + 6, x + w - 6, y + image_height - 6))
    else:
        box(p, x, y, w, image_height, INK)
        label(p, x + 18, y + 24, 'Application métier / CRM', w - 36, color='#b9b2a6')
        text(p, x + 18, y + 64, project['name'] + '.', 29, w - 36, 'bold', PAPER)
        box(p, x + 18, y + image_height - 30, 32, 3, RED)
    sy = label(p, x, y + image_height + 14, project['category'], w)
    sy = text(p, x, sy + 7, project['name'], 19, w, 'bold')
    sy = text(p, x, sy + 10, project['description'], 10, w)
    sy = text(p, x, sy + 12, project['stack'], 8.2, w, 'mono', RED)
    title, uri = project_link(project)
    link(p, x, sy + 12, title, uri, 9, width=w)


def build_portfolio():
    doc = fitz.open()
    p = new_page(doc, 'PORTFOLIO', 1)
    label(p, 40, 91, 'Nabil Ould-Terki / Sélection de réalisations')
    text(p, 40, 132, 'Des interfaces.\nDes systèmes.\nDes expériences.', 42, font='bold', leading=1.12)
    portrait(p, 479, 193, 76)
    text(p, 40, 309, 'Du besoin métier à un produit utilisé.', 15, font='bold')
    text(p, 40, 348, DATA['summary'], 12, 495)
    y = section(p, 40, 462, 'Expérience & réalisations')
    text(p, 40, y, 'En entreprise', 17, 245, 'bold')
    text(p, 40, y + 34, 'CDI chez GRANITE depuis mai 2024. Applications métier, gestion de patrimoine, CRM et expérience full stack.', 11, 235, color=MUTED)
    text(p, 312, y, 'Produits & R&D', 17, 245, 'bold')
    text(p, 312, y + 34, 'Applications, jeux mobiles, moteur 3D, marketplace et outils de R&D.', 11, 243, color=MUTED)
    box(p, 40, 667, 515, 62, INK)
    text(p, 55, 681, '.NET / C#   ·   Angular / React   ·   Flutter', 11, 485, 'bold', PAPER)
    text(p, 55, 705, 'Architecture · UX/UI · API · Cloud · Livraison', 9, 485, 'mono', '#b9b2a6')
    contacts(p, 756)
    for number, title, subtitle, ids in [
        (2, 'Applications & métier.', 'Des interfaces pensées pour les usages quotidiens.', (0, 1)),
        (3, 'Le jeu comme terrain.', 'Une sélection de jeux cross-platform et mobiles.', (2, 3)),
        (4, 'Explorer & construire.', 'Outils, reverse-engineering et commerce en ligne.', (4, 5))
    ]:
        p = new_page(doc, 'PORTFOLIO', number, title, subtitle)
        for col, index in enumerate(ids):
            portfolio_card(p, DATA['projects'][index], 40 + col * 272, 200, 243, 183)
        if number == 2:
            y = section(p, 40, 661, 'Également / ADD Associés')
            end = text(p, 40, y, 'Chez GRANITE : gestion de patrimoine, intégration de données financières et rapports personnalisés. React / Redux / .NET Core / Azure. Application privée.', 10, 515, color=MUTED)
            link(p, 40, end + 10, 'Voir la présentation sur le site', DATA['website'] + '#project-add-associes', 9)
        else:
            rule(p, 40, 713, 515)
            link(p, 40, 732, 'Retrouvez les démonstrations et les liens sur mon site', DATA['website'], 10)
    if DATA.get('certifications'):
        p = new_page(doc, 'PORTFOLIO', 5, 'Apprendre & pratiquer.', 'Cinq certificats de fin de formation Udemy, avec leurs attestations et liens.')
        for i, cert in enumerate(DATA['certifications']):
            y = 188 + i * 114
            image(p, cert['preview'], (40, y, 170, y + 96))
            end = text(p, 190, y + 3, cert['title'], 12, 365, 'bold')
            end = text(p, 190, end + 5, cert['issuer'] + ' · ' + certificate_date(cert) + ' · ' + certificate_hours(cert), 8.5, 365, 'mono', MUTED)
            end = text(p, 190, end + 4, 'Formateur : ' + cert['instructor'], 9, 365, color=MUTED)
            link(p, 190, end + 6, 'Vérifier sur Udemy', cert['url'], 9, width=170)
            link(p, 365, end + 6, 'Attestation PDF', DATA['website'] + cert['file'], 9, width=190)
    return doc


def save_document(doc, identifier, filename, title, description, format_label):
    doc.set_metadata({'title': title + ' — ' + DATA['name'], 'author': DATA['name'], 'subject': description, 'creator': 'Portfolio Nabil OULD-TERKI'})
    doc.subset_fonts()
    pdf_path = OUT / filename
    doc.save(pdf_path, garbage=4, deflate=True)
    pages = []
    for i, page in enumerate(doc):
        name = f'{identifier}-{i + 1}.webp'
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), alpha=False)
        from PIL import Image
        im = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
        im.save(OUT / name, format='WEBP', quality=88)
        pages.append({'src': 'assets/documents/' + name, 'width': pixmap.width, 'height': pixmap.height})
    item = {'id': identifier, 'title': title, 'description': description, 'format': format_label, 'file': 'assets/documents/' + filename, 'filename': filename, 'pageCount': len(doc), 'size': pdf_path.stat().st_size, 'pages': pages}
    doc.close()
    return item


def main():
    prepare_certifications()
    documents = [
        save_document(build_cv(), 'cv', 'Nabil-OULD-TERKI-CV.pdf', 'Le CV', 'Expériences, formation, compétences et réalisations. Le parcours complet.', 'A4 · 2 pages'),
        save_document(build_profile(), 'presentation', 'Nabil-OULD-TERKI-Presentation.pdf', 'La présentation', 'Une page pour comprendre mon profil, mon approche et mes domaines d’intervention.', 'A4 · 1 page'),
        save_document(build_card(), 'carte', 'Nabil-OULD-TERKI-Carte-de-visite.pdf', 'La carte de visite', 'Un format compact, recto verso, pour garder le contact.', '85 × 55 mm · Recto / verso'),
        save_document(build_portfolio(), 'portfolio', 'Nabil-OULD-TERKI-Portfolio.pdf', 'Le portfolio', 'Réalisations illustrées et certificats : applications métier, mobile, jeux et R&D.', 'A4 · 5 pages')
    ]
    (OUT / 'manifest.json').write_text(json.dumps(documents, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # A normal script (no fetch dependency) makes the viewer work from file:// too.
    (OUT / 'catalog.js').write_text('window.PORTFOLIO_DOCUMENTS = ' + json.dumps(documents, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
    vcard = '\r\n'.join(['BEGIN:VCARD', 'VERSION:3.0', 'N:OULD-TERKI;Nabil;;;', 'FN:' + DATA['name'], 'TITLE:' + DATA['role'], 'EMAIL;TYPE=INTERNET:' + DATA['email'], 'TEL;TYPE=CELL:+33641405237', 'ADR;TYPE=WORK:;;;Paris;;;France', 'URL:' + DATA['website'], 'NOTE:En CDI chez GRANITE.', 'END:VCARD', ''])
    (OUT / 'Nabil-OULD-TERKI.vcf').write_bytes(vcard.encode('utf-8'))
    with zipfile.ZipFile(OUT / 'Nabil-OULD-TERKI-Kit.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for item in documents:
            archive.write(OUT / item['filename'], item['filename'])
        archive.write(OUT / 'Nabil-OULD-TERKI.vcf', 'Nabil-OULD-TERKI.vcf')
        for cert in DATA.get('certifications', []):
            archive.write(ROOT / cert['file'], 'Certificats/' + cert['id'] + '.pdf')
    print(json.dumps([{'document': item['title'], 'pages': item['pageCount'], 'bytes': item['size']} for item in documents], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
