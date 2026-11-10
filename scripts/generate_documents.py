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


def prepare_case_studies():
    """Keep the website stories and PDF stories on the same content source."""
    from PIL import Image
    articles = []
    for case in DATA.get('case_studies', []):
        decisions = ''.join('<dt>' + escape(d['title']) + '</dt><dd>' + escape(d['description']) + '</dd>' for d in case['decisions'])
        deliverables = ''.join('<li>' + escape(item) + '</li>' for item in case['deliverables'])
        if case.get('screenshots'):
            shots = []
            for shot in case['screenshots']:
                with Image.open(ROOT / shot['file']) as original:
                    w, h = original.size
                shots.append(f'<figure><a href="{escape(shot["file"])}" target="_blank" rel="noopener" aria-label="Agrandir : {escape(shot["label"])}"><img src="{escape(shot["file"])}" alt="{escape(shot["label"])} — application Jeto" width="{w}" height="{h}" loading="lazy"></a><figcaption>{escape(shot["label"])}</figcaption></figure>')
            visual = '<div class="study-screenshots">' + ''.join(shots) + '</div>'
        else:
            nodes = '<span aria-hidden="true">↓</span>'.join('<span>' + escape(node) + '</span>' for node in case['flow'])
            style = ' study-flow-finance' if case['id'] == 'add-associes' else ''
            visual = '<div class="study-flow' + style + '"><span class="doc-eyebrow">Parcours fonctionnel</span>' + nodes + '</div>'
        evidence = ''.join(f'<a href="{escape(item["url"])}" target="_blank" rel="noopener">{escape(item["label"])} <span aria-hidden="true">↗</span></a>' for item in case['links'])
        if not case['links']:
            evidence = '<p>Projet réalisé chez GRANITE.<br>Application privée.</p>'
        tech = ''.join('<span>' + escape(item) + '</span>' for item in case['technologies'])
        headline = '<br>'.join(escape(line) for line in case['headline'].split('\n'))
        articles.append(f'''        <article class="case-study" data-case-content="{case['id']}" data-case-title="{escape(case['name'])}" hidden>
          <div class="study-intro"><span class="study-status">{escape(case['status'])}</span><h3>{headline}</h3><p>{escape(case['summary'])}</p></div>
          <div class="study-layout">
            <div class="study-narrative">
              <section><h4>Le besoin</h4><p>{escape(case['context'])}</p></section>
              <section><h4>Ma contribution</h4><p>{escape(case['contribution'])}</p></section>
              <section><h4>Les choix de réalisation</h4><dl class="study-decisions">{decisions}</dl></section>
              <section><h4>Les fonctionnalités livrées</h4><ul class="study-deliverables">{deliverables}</ul></section>
            </div>
            <aside class="study-evidence" aria-label="Preuves et technologies : {escape(case['name'])}">
              {visual}
              <div class="study-evidence-content"><span class="doc-eyebrow">À consulter</span>{evidence}<div class="study-tech">{tech}</div></div>
            </aside>
          </div>
        </article>''')
    if not articles:
        return
    index = ROOT / 'index.html'
    source = index.read_text(encoding='utf-8')
    start = '<div class="case-scroll" id="caseScroll">'
    end = '\n      </div>\n      <footer class="case-actions">'
    before, remaining = source.split(start, 1)
    _, after = remaining.split(end, 1)
    index.write_text(before + start + '\n' + '\n'.join(articles) + end + after, encoding='utf-8')


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
    rec = DATA['recruitment']
    text(p, 40, 80, DATA['name'], 17, font='bold')
    text(p, 40, 111, 'Ingénieur Full Stack\n.NET / Angular', 29, 425, 'bold', leading=1.08)
    portrait(p, 479, 106, 76)
    text(p, 40, 181, rec['mobile'] + ' · ' + rec['experience'], 10.5, 515, color=MUTED)
    box(p, 40, 211, 515, 28, INK)
    text(p, 52, 219, 'Paris · CDI chez GRANITE · Préavis : ' + rec['notice'], 9, 491, 'mono', PAPER)
    text(p, 40, 254, rec['pitch'], 10.2, 515)
    contacts(p, 286)
    link(p, 40, 306, 'LinkedIn', DATA['linkedin'], 8)
    link(p, 105, 306, 'GitHub / UserNabil', DATA['github'], 8)
    link(p, 215, 306, 'Portfolio & études de cas', DATA['website'] + '#work', 8)
    y = section(p, 40, 322, '01 / Expériences professionnelles')
    for exp in DATA['experience']:
        y = label(p, 40, y, exp['dates'])
        y = text(p, 40, y + 4, exp['company'], 13, 515, 'bold')
        y = text(p, 40, y + 1, exp['role'], 9.4, 515, color=MUTED)
        for detail in exp['details']:
            y = text(p, 40, y + 6, detail, 9.6, 515)
        y = text(p, 40, y + 6, exp['stack'], 8, 515, 'mono', RED) + 8
    if y > 760:
        raise ValueError(f'CV experience section needs more space: {y}')
    text(p, 40, 766, 'Langues : français · anglais professionnel (TOEIC validé)', 8.5, color=MUTED)

    p = new_page(doc, 'CV', 2, 'Réalisations & compétences.', 'Des produits livrés, des compétences appliquées et une formation continue.')
    y = section(p, 40, 184, '02 / Réalisations sélectionnées · Liens cliquables')
    for i, project in enumerate(DATA['projects']):
        x = 40 + (i % 2) * 272
        sy = y + (i // 2) * 66
        _, uri = project_link(project)
        link(p, x, sy, project['name'], uri, 11.5, width=245, font='bold')
        text(p, x, sy + 21, project['cv_summary'], 9.2, 240)
    y = section(p, 40, 429, '03 / Compétences')
    for i, skill in enumerate(DATA['skills']):
        x = 40 + (i % 2) * 272
        sy = y + (i // 2) * 44
        text(p, x, sy, skill['label'], 11, 245, 'bold')
        text(p, x, sy + 18, skill['value'], 9, 240, color=MUTED)
    y = section(p, 40, 621, '04 / Formation', 245)
    for i, edu in enumerate(DATA['education']):
        sy = y + i * 43
        end = text(p, 40, sy, edu['title'], 9.2, 245, 'bold')
        text(p, 40, end + 3, edu['dates'] + ' · ' + edu['school'], 8, 245, color=MUTED)
    y = section(p, 312, 621, '05 / Certificats · Udemy', 243)
    for i, cert in enumerate(DATA.get('certifications', [])):
        sy = y + i * 25
        link(p, 312, sy, cert['cv_title'], cert['url'], 8.7, width=243, font='bold')
        text(p, 312, sy + 13, certificate_date(cert) + ' · ' + certificate_hours(cert), 7.3, 243, 'mono', MUTED)
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


def portfolio_card(p, project, x, y, w, image_height=132, compact=False):
    box(p, x, y, w, image_height, '#e9e4da')
    if project['image']:
        image(p, project['image'], (x + 6, y + 6, x + w - 6, y + image_height - 6))
    else:
        box(p, x, y, w, image_height, INK)
        label(p, x + 18, y + 24, 'Application métier / CRM', w - 36, color='#b9b2a6')
        text(p, x + 18, y + 64, project['name'] + '.', 29, w - 36, 'bold', PAPER)
        box(p, x + 18, y + image_height - 30, 32, 3, RED)
    sy = label(p, x, y + image_height + 14, project['category'], w)
    sy = text(p, x, sy + 7, project['name'], 15 if compact else 19, w, 'bold')
    sy = text(p, x, sy + 8, project['description'], 8.7 if compact else 10, w)
    sy = text(p, x, sy + 8, project['stack'], 7.3 if compact else 8.2, w, 'mono', RED)
    title, uri = project_link(project)
    link(p, x, sy + 8, title, uri, 8 if compact else 9, width=w)


def case_page(doc, case, number):
    p = new_page(doc, 'PORTFOLIO', number, case['name'], case['summary'])
    label(p, 40, 177, case['status'])
    if case.get('screenshots'):
        box(p, 40, 204, 515, 180, '#e9e4da')
        for i, shot in enumerate(case['screenshots']):
            x = 76 + i * 162
            image(p, shot['file'], (x, 212, x + 120, 368))
        text(p, 52, 373, 'Captures de l’application publiées sur Google Play', 7, 490, color=MUTED)
    else:
        box(p, 40, 204, 515, 180, INK)
        label(p, 58, 224, 'Parcours fonctionnel', color='#b9b2a6')
        for i, node in enumerate(case['flow']):
            x = 58 + i * 167
            text(p, x, 267, str(i + 1).zfill(2), 10, 145, 'mono', RED)
            text(p, x, 296, node, 14, 140, 'bold', PAPER)
        rule(p, 58, 357, 479, '#484339')
    x, w = 40, 309
    y = section(p, x, 411, 'Le besoin', w)
    y = text(p, x, y, case['context'], 9.4, w, color=MUTED)
    y = section(p, x, y + 16, 'Ma contribution', w)
    y = text(p, x, y, case['contribution'], 9.4, w)
    y = section(p, x, y + 16, 'Choix de réalisation', w)
    for decision in case['decisions']:
        y = text(p, x, y, decision['title'], 9.2, w, 'bold')
        y = text(p, x, y + 2, decision['description'], 8.7, w, color=MUTED) + 8
    if y > 754:
        raise ValueError(f'Case study {case["id"]} overflows narrative column: {y}')
    x, w = 380, 175
    y = section(p, x, 411, 'Fonctionnalités livrées', w)
    for item in case['deliverables']:
        y = text(p, x, y, item, 9.2, w) + 12
    y = section(p, x, y + 9, 'Technologies', w)
    text(p, x, y, ' · '.join(case['technologies']), 8.2, w, 'mono', MUTED)
    link(p, 40, 758, 'Lire l’étude sur le site', DATA['website'] + '#case-' + case['id'], 9, width=230)
    if case['links']:
        link(p, 312, 758, 'Voir le projet en ligne', case['links'][0]['url'], 9, width=243)
    return p


def build_portfolio():
    doc = fitz.open()
    p = new_page(doc, 'PORTFOLIO', 1)
    rec = DATA['recruitment']
    label(p, 40, 89, 'Nabil Ould-Terki / Portfolio de réalisations')
    text(p, 40, 123, 'Du besoin métier\nau produit livré.', 38, font='bold', leading=1.12)
    portrait(p, 479, 135, 76)
    text(p, 40, 236, rec['headline'], 17, font='bold')
    text(p, 40, 268, rec['mobile'] + ' · ' + rec['experience'], 11, color=MUTED)
    text(p, 40, 314, rec['pitch'], 12, 500)
    y = section(p, 40, 406, 'Trois études de cas pour découvrir mon travail')
    for i, case in enumerate(DATA['case_studies']):
        sy = y + i * 58
        label(p, 40, sy, str(i + 2).zfill(2), 35)
        link(p, 85, sy - 2, case['name'], DATA['website'] + '#case-' + case['id'], 15, width=470, font='bold')
        text(p, 85, sy + 23, case['status'], 9, 470, color=MUTED)
    box(p, 40, 663, 515, 65, INK)
    text(p, 55, 677, 'Paris · CDI chez GRANITE · Préavis : ' + rec['notice'], 10, 485, 'bold', PAPER)
    text(p, 55, 701, 'UX/UI · Web · API · Mobile · Cloud', 9, 485, 'mono', '#b9b2a6')
    contacts(p, 756)
    for number, case in enumerate(DATA['case_studies'], 2):
        case_page(doc, case, number)
    p = new_page(doc, 'PORTFOLIO', len(doc) + 1, 'Explorer & construire.', 'Jeux cross-platform, outillage et marketplace : une sélection complémentaire.')
    other_projects = [project for project in DATA['projects'] if project['id'] not in {'jeto', 'my-office'}]
    for i, project in enumerate(other_projects):
        portfolio_card(p, project, 40 + i % 2 * 272, 185 + i // 2 * 299, 243, 91, compact=True)
    if DATA.get('certifications'):
        p = new_page(doc, 'PORTFOLIO', len(doc) + 1, 'Apprendre & pratiquer.', 'Cinq certificats de fin de formation Udemy, avec leurs attestations et liens.')
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
        links = []
        for item in page.get_links():
            if item.get('kind') != fitz.LINK_URI:
                continue
            rect = item['from']
            link_label = page.get_textbox(rect).strip().replace('\n', ' ').replace('\u00a0', ' ')
            links.append({'url': item['uri'], 'label': link_label or item['uri'], 'rect': [
                round(rect.x0 / page.rect.width * 100, 5), round(rect.y0 / page.rect.height * 100, 5),
                round(rect.width / page.rect.width * 100, 5), round(rect.height / page.rect.height * 100, 5)
            ]})
        pages.append({'src': 'assets/documents/' + name, 'width': pixmap.width, 'height': pixmap.height, 'links': links})
    item = {'id': identifier, 'title': title, 'description': description, 'format': format_label, 'file': 'assets/documents/' + filename, 'filename': filename, 'pageCount': len(doc), 'size': pdf_path.stat().st_size, 'pages': pages}
    doc.close()
    return item


def main():
    prepare_certifications()
    prepare_case_studies()
    documents = [
        save_document(build_cv(), 'cv', 'Nabil-OULD-TERKI-CV.pdf', 'Le CV', 'Expériences, formation, compétences et réalisations. Le parcours complet.', 'A4 · 2 pages'),
        save_document(build_profile(), 'presentation', 'Nabil-OULD-TERKI-Presentation.pdf', 'La présentation', 'Une page pour comprendre mon profil, mon approche et mes domaines d’intervention.', 'A4 · 1 page'),
        save_document(build_card(), 'carte', 'Nabil-OULD-TERKI-Carte-de-visite.pdf', 'La carte de visite', 'Un format compact, recto verso, pour garder le contact.', '85 × 55 mm · Recto / verso'),
        save_document(build_portfolio(), 'portfolio', 'Nabil-OULD-TERKI-Portfolio.pdf', 'Le portfolio', 'Trois études de cas, des réalisations illustrées et les certificats de formation.', 'A4 · 6 pages')
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
