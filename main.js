import { Actor } from 'apify';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; RemoteJobsAggregator/0.1; Apify Actor)' };
const get = async (url, type = 'json') => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return type === 'json' ? r.json() : r.text();
};
const strip = (h = '') => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const toIso = (v) => { if (!v) return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };
const job = (o) => ({
  source: o.source, title: o.title || null, company: o.company || null, location: o.location || null,
  remote: o.remote ?? true, jobType: o.jobType || null, tags: o.tags || [],
  salaryMin: o.salaryMin || null, salaryMax: o.salaryMax || null, salaryCurrency: o.salaryCurrency || null, salaryPeriod: o.salaryPeriod || null,
  postedAt: toIso(o.postedAt), url: o.url || null, applyUrl: o.applyUrl || o.url || null,
  description: strip(o.description || '').slice(0, 3000) || null,
});

const sources = {
  async remoteok() {
    const d = await get('https://remoteok.com/api');
    return d.filter((x) => x.id && x.position).map((x) => job({ source: 'remoteok', title: x.position, company: x.company, location: x.location || 'Remote', tags: x.tags,
      salaryMin: x.salary_min, salaryMax: x.salary_max, salaryCurrency: 'USD', salaryPeriod: 'yearly', postedAt: x.date, url: x.url, applyUrl: x.apply_url, description: x.description }));
  },
  async remotive() {
    const d = await get('https://remotive.com/api/remote-jobs');
    return d.jobs.map((x) => job({ source: 'remotive', title: x.title, company: x.company_name, location: x.candidate_required_location, jobType: x.job_type, tags: [x.category, ...(x.tags || [])].filter(Boolean),
      postedAt: x.publication_date, url: x.url, description: x.description, ...salaryFromText(x.salary) }));
  },
  async weworkremotely() {
    const xml = await get('https://weworkremotely.com/remote-jobs.rss', 'text');
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const t = (k) => { const r = m[1].match(new RegExp(`<${k}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${k}>`)); return r ? r[1].trim() : null; };
      const full = strip(t('title') || ''); const i = full.indexOf(':');
      return job({ source: 'weworkremotely', title: i > 0 ? full.slice(i + 1).trim() : full, company: i > 0 ? full.slice(0, i).trim() : null, location: t('region') || 'Remote',
        jobType: t('type'), tags: [t('category')].filter(Boolean), postedAt: t('pubDate'), url: t('link'), description: t('description') });
    });
  },
  async himalayas() {
    const out = [];
    for (let off = 0; off < 400; off += 20) {
      const d = await get(`https://himalayas.app/jobs/api?limit=20&offset=${off}`);
      if (!d.jobs?.length) break;
      for (const x of d.jobs) out.push(job({ source: 'himalayas', title: x.title, company: x.companyName, location: (x.locationRestrictions || []).join(', ') || 'Worldwide', jobType: x.employmentType,
        tags: [...(x.categories || []), ...(x.seniority || [])], salaryMin: x.minSalary, salaryMax: x.maxSalary, salaryCurrency: x.currency, salaryPeriod: 'yearly', postedAt: x.pubDate, url: x.guid, applyUrl: x.applicationLink, description: x.description }));
    }
    return out;
  },
  async arbeitnow() {
    const out = [];
    for (let p = 1; p <= 3; p++) {
      const d = await get(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
      for (const x of d.data || []) out.push(job({ source: 'arbeitnow', title: x.title, company: x.company_name, location: x.location, remote: !!x.remote, jobType: (x.job_types || []).join(', '), tags: x.tags, postedAt: x.created_at, url: x.url, description: x.description }));
    }
    return out;
  },
  async jobicy() {
    const d = await get('https://jobicy.com/api/v2/remote-jobs?count=100');
    return (d.jobs || []).map((x) => job({ source: 'jobicy', title: x.jobTitle, company: x.companyName, location: x.jobGeo, jobType: [].concat(x.jobType || []).join(', '), tags: [].concat(x.jobIndustry || []),
      salaryMin: x.salaryMin, salaryMax: x.salaryMax, salaryCurrency: x.salaryCurrency, salaryPeriod: x.salaryPeriod, postedAt: x.pubDate, url: x.url, description: x.jobDescription }));
  },
  async hn_who_is_hiring() {
    const s = await get('https://hn.algolia.com/api/v1/search_by_date?query=%22who%20is%20hiring%22&tags=story,author_whoishiring&hitsPerPage=5');
    const thread = s.hits.find((h) => /who is hiring/i.test(h.title) && !/freelancer|wants to be hired/i.test(h.title));
    if (!thread) return [];
    const out = [];
    for (let p = 0; p < 4; p++) {
      const d = await get(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${thread.objectID}&hitsPerPage=200&page=${p}`);
      for (const c of d.hits) {
        if (String(c.parent_id) !== String(thread.objectID) || !c.comment_text) continue;
        const text = strip(c.comment_text.replace(/<p>/g, '\n'));
        const head = text.split('|').map((s) => s.trim());
        out.push(job({ source: 'hn_who_is_hiring', title: head.slice(1, 3).join(' | ') || text.slice(0, 80), company: head[0]?.slice(0, 80), location: head.find((h) => /remote|onsite|hybrid/i.test(h)) || null,
          remote: /remote/i.test(head.join(' ')), tags: [], postedAt: c.created_at, url: `https://news.ycombinator.com/item?id=${c.objectID}`, description: text }));
      }
      if (p >= d.nbPages - 1) break;
    }
    return out;
  },
};

function salaryFromText(t) {
  if (!t) return {};
  const nums = [...String(t).replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)].map((m) => Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1))).filter((n) => n >= 1000);
  return nums.length ? { salaryMin: nums[0], salaryMax: nums[1] || nums[0], salaryCurrency: /€|eur/i.test(t) ? 'EUR' : /£|gbp/i.test(t) ? 'GBP' : 'USD', salaryPeriod: 'yearly' } : {};
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const kw = (input.keywords || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
const ex = (input.excludeKeywords || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
const chosen = input.sources?.length ? input.sources : Object.keys(sources);
const cutoff = Date.now() - (input.maxAgeDays ?? 14) * 864e5;
const minSal = input.minSalaryUsd || 0;
const maxResults = input.maxResults ?? 100;

const all = [];
await Promise.all(chosen.filter((s) => sources[s]).map(async (s) => {
  try { const r = await sources[s](); console.log(`${s}: ${r.length} fetched`); all.push(...r); }
  catch (e) { console.warn(`${s}: failed - ${e.message}`); }
}));

const seen = new Set();
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const yearly = (j) => { const v = j.salaryMax || j.salaryMin || 0; return j.salaryPeriod === 'monthly' ? v * 12 : j.salaryPeriod === 'hourly' ? v * 2000 : v; };
const items = all
  .filter((j) => j.title && (!j.postedAt || Date.parse(j.postedAt) >= cutoff))
  .filter((j) => { const hay = `${j.title} ${j.company} ${j.tags.join(' ')} ${j.description || ''}`.toLowerCase(); return !kw.length || kw.some((k) => hay.includes(k)); })
  .filter((j) => { const hay = `${j.title} ${j.tags.join(' ')}`.toLowerCase(); return !ex.some((k) => hay.includes(k)); })
  .filter((j) => !minSal || (j.salaryCurrency === 'USD' || !j.salaryCurrency) && yearly(j) >= minSal)
  .filter((j) => { const k = norm(j.company) + '|' + norm(j.title); if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0))
  .slice(0, maxResults);

console.log(`Pushing ${items.length} jobs`);
if (items.length) await Actor.pushData(items);
await Actor.exit();
