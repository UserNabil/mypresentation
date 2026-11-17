// The same grounded answers run in the browser, the local server and the Worker.
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const terms = value => normalize(value).match(/[a-z0-9+#.]{2,}/g) || [];
const stop = new Set(terms('le la les des une un de du dans en est et ou que qui quel quelle quelles quels son ses sa ton tes ta mon mes ma il elle pour par avec sur au aux vous votre vos tu peux peut faire moi nabil comment pourquoi sont plus ce ces as avez avez-vous'));
const meaningful = value => terms(value).filter(word => !stop.has(word));

export function answerQuestion(question, profile) {
  const q = normalize(question);
  const links = [];
  const parts = [];
  const add = (text, label, url) => { parts.push(text); if (url) links.push({ label, url }); };
  if (/dispo|libre|quand|commenc|demarr|preavis|recrut|embauch|contrat|\bcdi\b|poste|mission|ouvert|ecoute|opportun|currently|available|hiring|notice/.test(q)) {
    add(`${profile.status} Le préavis indiqué est de ${profile.recruitment.notice}. Pour confirmer une date de démarrage, contactez Nabil directement.`, 'Échanger avec Nabil', '#contact');
  }
  if (/tjm|tarif|prix|cout|salaire|remuner|pretention|factur|budget|daily rate|\brate\b/.test(q)) {
    add(`La fourchette affichée est de ${profile.pricing.daily_rate_min_eur} à ${profile.pricing.daily_rate_max_eur} € par jour. Le tarif dépend du périmètre de la mission et doit être confirmé avec Nabil.`, 'Contact et tarifs', '#contact');
  }
  if (/contact|joindre|contacter|email|e-mail|mail|telephone|\btel\b|numero|linkedin|malt|ecrire|appel|rendez|rdv/.test(q)) {
    add(`Vous pouvez contacter Nabil à ${profile.email}, au ${profile.phone}, ou via LinkedIn.`, 'LinkedIn', profile.linkedin);
    links.push({ label: 'Envoyer un e-mail', url: `mailto:${profile.email}` });
  }
  if (/diplom|formation|ecole|etud|education/.test(q) && !/certif|udemy/.test(q)) {
    add(profile.education.map(item => `${item.dates} : ${item.title} — ${item.school}.`).join('\n'), 'Voir le parcours', '#path');
  }
  if (/certif|udemy|attestation/.test(q)) {
    add(`Les attestations de fin de formation Udemy sont :\n${profile.certifications.map(item => `${item.title} (${item.date.slice(0, 4)}).`).join('\n')}`, 'Voir les attestations', '#path');
    profile.certifications.forEach(item => links.push({ label: item.cv_title, url: item.url }));
  }
  if (/\bcv\b|curriculum|pdf|telecharg|download|resume|\bdocument/.test(q)) {
    add('Le CV, le portfolio illustré, la fiche de présentation et la carte de visite sont consultables et téléchargeables dans la bibliothèque de documents.', 'Ouvrir les documents', '#documents');
  }
  if (/experience|parcours|entreprise|employeur|carriere|travaille|bosse|granite/.test(q)) {
    // Prefer actual dates over an editorial total that can become stale.
    add(profile.experience.map(item => `${item.dates} : ${item.role} — ${item.company}.\n${item.details.join(' ')}`).join('\n\n'), 'Voir le parcours détaillé', '#path');
  }
  const special = /projets?|realisation|portfolio|what.*built|application|\bapp\b|jeux?|\bgame/.test(q);
  const queryTerms = meaningful(question);
  const candidates = [
    ...profile.projects.map(project => {
      const study = profile.case_studies.find(item => item.id === project.id);
      return { title: project.name, text: `${project.description}\nTechnologies : ${project.stack}.${study ? `\nContribution : ${study.contribution}` : ''}`, url: study ? `#case-${study.id}` : `#project-${project.id}`, keywords: `${project.name} ${project.stack} ${project.description}` };
    }),
    ...profile.experience.map(item => ({ title: item.company, text: `${item.dates} : ${item.role}.\n${item.details.join('\n')}\nTechnologies : ${item.stack}.`, url: '#path', keywords: `${item.company} ${item.details.join(' ')} ${item.stack}` })),
    ...profile.skills.map(item => ({ title: item.label, text: `${item.label} : ${item.value}.`, url: '#skills', keywords: `${item.label} ${item.value}` }))
  ];
  const ranked = candidates.map(item => ({ ...item, score: queryTerms.reduce((score, word) => score + (normalize(item.keywords).includes(word) ? (normalize(item.title).includes(word) ? 4 : 1) : 0), 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (special && !ranked.some(item => item.score >= 4)) {
    profile.projects.slice(0, 3).forEach(project => add(`${project.name} : ${project.description}`, project.name, `#${profile.case_studies.some(item => item.id === project.id) ? 'case-' : 'project-'}${project.id}`));
  } else if (!parts.length && ranked.length) {
    ranked.slice(0, 2).forEach(item => add(`${item.title}\n${item.text}`, `Consulter : ${item.title}`, item.url));
  }
  if (!parts.length && /competence|technolog|techno|stack|savoir.faire|skills|langage|framework|maitris|sait faire|outil/.test(q)) {
    add(profile.skills.map(item => `${item.label} : ${item.value}.`).join('\n'), 'Voir les compétences', '#skills');
  }
  if (!parts.length && /^(bonjour|salut|hello|hi|bonsoir|coucou|hey|yo|qui es|qui est|presente|presentation|parle)/.test(q)) {
    add(`${profile.name} — ${profile.role}.\n${profile.summary}\nPosez-moi une question sur ses projets, ses compétences, son parcours ou sa disponibilité.`, 'Découvrir le profil', '#about');
  }
  const answered = parts.length > 0;
  if (!answered) add('Cette information ne figure pas dans le profil publié. Je préfère vous orienter vers Nabil pour une réponse précise. Vous pouvez aussi préciser le nom d’un projet, d’une technologie ou d’une expérience.', 'Poser la question à Nabil', `mailto:${profile.email}`);
  return { answer: parts.join('\n\n'), answered, links: links.filter((link, i, all) => all.findIndex(item => item.url === link.url) === i).slice(0, 6) };
}
