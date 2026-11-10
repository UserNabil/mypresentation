"""Generate copyable Free-Work fields in the account form's section order.

Run: python scripts/export_freework.py
Portfolio content: content/profile.json
Private account fields: .local/free-work-settings.json (not published)
This script only writes a local Markdown file; it never contacts Free-Work.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def render(data, settings):
    lines = ['# Free-Work — ' + data['name']]

    def heading(title, level=2):
        lines.extend(['', '#' * level + ' ' + title])

    def field(title, value, level=3):
        if value is None or value == '' or value == []:
            return
        heading(title, level)
        if isinstance(value, list):
            value = '\n'.join(value)
        lines.extend(['', '```text', str(value), '```'])

    personal = settings.get('personal', {})
    professional = settings.get('professional', {})
    search = settings.get('search', {})

    heading('Informations personnelles')
    field('Téléphone', personal.get('phone', data['phone']))
    field('Date de naissance', personal.get('birth_date'))
    field('Ville', personal.get('city', data['location']))
    field('Titre actuel', data['role'])
    field('Années d’expériences', personal.get('experience_years'))
    field('Visibilité', personal.get('visibility'))
    field('Anonymiser mon profil — sélection actuelle', personal.get('anonymous'))
    field('Entreprises blacklistées — sélection actuelle', personal.get('blacklisted_companies'))

    heading('Informations professionnelles')
    field('Statut recherché — cases activées', professional.get('statuses'))
    field('Type de contrat recherché — cases activées', professional.get('contracts'))
    field('Salaire annuel brut', professional.get('annual_salary'))
    field('TJM (Taux Journalier Moyen)', data.get('pricing', {}).get('daily_rate_min_eur', professional.get('daily_rate')))
    field('Devise', professional.get('currency'))
    field('Pays d’immatriculation', professional.get('registration_country'))
    field('Votre statut juridique — sélection actuelle', professional.get('legal_status'))
    field('De quel pays êtes-vous ressortissant ? — sélection actuelle', professional.get('citizenship_selection'))
    field('Autorisation de travail additionnel — sélection actuelle', professional.get('additional_work_authorization'))

    heading('Recherche de poste')
    field('Disponibilité', search.get('availability'))
    field('Métiers recherchés — sélectionner les entrées', search.get('jobs'))
    field('Métiers à mettre en avant — 3 étoiles', search.get('priority_jobs'))
    field('Nb de jours/semaine', search.get('weekly_work'))
    field('Mode de travail — cases activées', search.get('work_modes'))
    field('Toutes les zones de recherche — sélectionner les entrées', search.get('locations'))

    heading('Expérience')
    by_company = {exp['company']: exp for exp in data['experience']}
    experiences = settings.get('experiences') or [
        {'source_company': exp['company'], 'company': exp['company'], 'title': exp['role']}
        for exp in data['experience']
    ]
    for entry in experiences:
        exp = by_company[entry['source_company']]
        heading(entry['company'], 3)
        field('Intitulé du poste', entry['title'], 4)
        field('Entreprise', entry['company'], 4)
        field('Type de contrat', entry.get('contract'), 4)
        field('Date de début', entry.get('start'), 4)
        field('Date de fin / poste actuel', entry.get('end'), 4)
        field('Localisation', entry.get('location'), 4)
        field('Mode de travail', entry.get('work_mode'), 4)
        details = list(exp['details']) + entry.get('extra_details', [])
        stack = exp['stack']
        if entry.get('extra_stack'):
            stack += ' · ' + entry['extra_stack']
        description = '\n\n'.join(details + ['Environnement technique : ' + stack + '.'])
        field('Description', description, 4)

    heading('Formation')
    for edu in settings.get('education', []):
        heading(edu['title'], 3)
        field('Intitulé', edu['title'], 4)
        field('Établissement', edu['school'], 4)
        field('Année d’obtention', edu['year'], 4)
        field('Diplôme / niveau', edu.get('level'), 4)

    heading('Certifications')
    for cert in data.get('certifications', []):
        heading(cert['title'], 3)
        field('Intitulé', cert['title'], 4)
        field('Organisme', cert['issuer'], 4)
        field('Date d’obtention', '/'.join(reversed(cert['date'].split('-'))), 4)
        field('Identifiant du certificat', cert['id'], 4)
        field('Lien du certificat', cert['url'], 4)

    heading('Compétences')
    skills = settings.get('skills', [])
    priorities = settings.get('priority_skills', [])
    if len(skills) > 20 or len(priorities) > 5 or not set(priorities) <= set(skills):
        raise ValueError('Free-Work accepte au maximum 20 compétences et 5 compétences prioritaires.')
    if len(search.get('priority_jobs', [])) > 3:
        raise ValueError('Free-Work accepte au maximum 3 métiers prioritaires.')
    field('Compétences techniques — sélectionner les entrées (20 maximum)', skills)
    field('Compétences à mettre en avant — 5 étoiles', priorities)
    field('Soft skills / Savoir-être — sélectionner les entrées', settings.get('soft_skills'))
    heading('Langues', 3)
    for language in settings.get('languages', []):
        heading(language['name'], 4)
        field('Langue', language['name'], 5)
        field('Niveau', language['level'], 5)

    heading('À propos de vous')
    projects = {project['id']: project for project in data['projects']}
    presentation = '\n\n'.join([
        data['summary'],
        data['status'],
        'Mon expérience comprend la gestion de patrimoine et les CRM, les applications mobiles, les API REST, la conception UX/UI sur Figma et le déploiement sur Azure.',
        'Parmi mes réalisations : ' + ', '.join(projects[key]['name'] for key in ['jeto', 'my-office', 'pravia', 'pavillon-noir', 'pirates-dice', 'eden']) + '.',
        'Retrouvez les démonstrations et les détails de mes projets dans mon portfolio.'
    ])
    if len(presentation) > 2000:
        raise ValueError('La présentation dépasse la limite de 2 000 caractères du champ fourni.')
    field('Présentation', presentation)
    field('LinkedIn', data['linkedin'])
    field('Site web', data['website'])
    field('Book / Projet en ligne', data['website'] + '#work')

    heading('Uploader un nouveau CV')
    field('Fichier à sélectionner', str(ROOT / 'assets/documents/Nabil-OULD-TERKI-CV.pdf'))
    return '\n'.join(lines) + '\n'


def main():
    data = json.loads((ROOT / 'content/profile.json').read_text(encoding='utf-8'))
    settings_path = ROOT / '.local/free-work-settings.json'
    settings = json.loads(settings_path.read_text(encoding='utf-8')) if settings_path.exists() else {}
    output = ROOT / 'exports/free-work-profil.md'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(data, settings), encoding='utf-8')
    print('Blocs à copier prêts : ' + str(output))


if __name__ == '__main__':
    main()
