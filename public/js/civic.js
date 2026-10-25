// Loads a voter's ballot from the Google Civic Information API (voterInfoQuery)
// and converts it to the same shape as the static files in data/zips/.
(function () {
  const VOTERINFO_URL = 'https://www.googleapis.com/civicinfo/v2/voterinfo';

  const LEVEL_LABELS = {
    country: 'Federal Office',
    administrativeArea1: 'State Office',
    administrativeArea2: 'County Office',
    locality: 'City Office',
    subLocality1: 'Local Office',
    subLocality2: 'Local Office',
    regional: 'Regional Office',
    special: 'Special District'
  };

  class CivicLookupError extends Error {
    constructor(message, kind) {
      super(message);
      this.kind = kind; // 'address' | 'no-election' | 'no-contests' | 'network'
    }
  }

  function partyClassFor(party) {
    const p = (party || '').toLowerCase();
    if (p.includes('democrat')) return 'party-dem';
    if (p.includes('republican')) return 'party-rep';
    return 'party-non';
  }

  function formatAddress(addr) {
    if (!addr) return '';
    const street = [addr.line1, addr.line2, addr.line3].filter(Boolean).join(', ');
    const cityLine = [addr.city, [addr.state, addr.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [addr.locationName, street, cityLine].filter(Boolean).join(', ');
  }

  function electionTypeFor(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('runoff')) return 'runoff';
    if (n.includes('primary')) return 'primary';
    if (n.includes('special')) return 'special';
    return 'general';
  }

  function categoryFor(contest) {
    const level = (contest.level || [])[0];
    if (contest.type === 'Referendum') return 'Ballot Measure';
    if ((contest.roles || []).some(r => r === 'highestCourtJudge' || r === 'judge')) return 'Judicial Office';
    return LEVEL_LABELS[level] || 'Office';
  }

  // Every race loaded from the API cites where its data came from.
  const DATA_SOURCE = { label: '🔗 Data: Voting Information Project via Google Civic API', url: 'https://www.votinginfoproject.org/' };

  function toRace(contest) {
    const sources = contest.referendumUrl ? [{ label: '🔗 Official measure text', url: contest.referendumUrl }] : [];
    sources.push(DATA_SOURCE);

    if (contest.type === 'Referendum') {
      const title = contest.referendumTitle || 'Ballot Measure';
      const responses = contest.referendumBallotResponses && contest.referendumBallotResponses.length
        ? contest.referendumBallotResponses
        : ['Yes', 'No'];
      return {
        shortTitle: title,
        type: 'Ballot Measure • Vote for One',
        category: 'Ballot Measure',
        title: [title, contest.referendumSubtitle].filter(Boolean).join(': '),
        overview: contest.referendumBrief || contest.referendumText || contest.referendumSubtitle || 'See the official measure text for details.',
        details: {
          pro: contest.referendumProStatement || '',
          con: contest.referendumConStatement || '',
          fullText: contest.referendumText || '',
          passageThreshold: contest.referendumPassageThreshold || '',
          effectOfAbstain: contest.referendumEffectOfAbstain || ''
        },
        sources,
        candidates: responses.map(r => ({ name: r, party: '', partyClass: 'party-non' }))
      };
    }

    const office = contest.office || 'Office';
    const district = contest.district && contest.district.name;
    const voteFor = Number(contest.numberVotingFor) > 1 ? `Vote for ${contest.numberVotingFor}` : 'Vote for One';
    const category = categoryFor(contest);
    return {
      shortTitle: office,
      type: `${category} • ${voteFor}`,
      category,
      title: district && !office.includes(district) ? `${office} (${district})` : office,
      overview: district ? `This contest covers ${district}.` : '',
      sources,
      // Kept in the order the API returns, which follows the official ballot.
      candidates: (contest.candidates || []).map(c => ({
        name: c.name,
        party: c.party || '',
        partyClass: partyClassFor(c.party),
        site: c.candidateUrl || '',
        email: c.email || '',
        phone: c.phone || '',
        channels: (c.channels || []).filter(ch => ch && ch.type && ch.id)
      }))
    };
  }

  function toDistrictData(res) {
    const input = res.normalizedInput || {};
    const state = (res.state || [])[0] || {};
    const admin = state.electionAdministrationBody || {};
    const pollingLocation = (res.pollingLocations || [])[0];
    const contests = (res.contests || []).filter(c => c.type === 'Referendum' || (c.candidates && c.candidates.length));

    if (!contests.length) {
      throw new CivicLookupError('No contests are published for this address yet.', 'no-contests');
    }

    return {
      source: 'civic',
      state: state.name || input.state || '',
      stateCode: (input.state || '').toUpperCase(),
      locationName: [input.city, input.state].filter(Boolean).join(', '),
      districtText: res.election.name,
      election: {
        name: res.election.name,
        date: res.election.electionDay,
        type: electionTypeFor(res.election.name)
      },
      votingInfo: {
        pollingLocation: pollingLocation ? formatAddress(pollingLocation.address) : '',
        pollingHours: pollingLocation ? pollingLocation.pollingHours || '' : '',
        hasEarlyVoting: !!(res.earlyVoteSites && res.earlyVoteSites.length),
        hasDropOff: !!(res.dropOffLocations && res.dropOffLocations.length),
        electionInfoUrl: admin.electionInfoUrl || '',
        registrationUrl: admin.electionRegistrationUrl || '',
        ballotInfoUrl: admin.ballotInfoUrl || ''
      },
      // Raw API fields, passed through for the voting recap on the summary step.
      pollingLocations: res.pollingLocations || [],
      earlyVoteSites: res.earlyVoteSites || [],
      dropOffLocations: res.dropOffLocations || [],
      electionAdministrationBody: admin,
      races: contests.map(toRace)
    };
  }

  async function fetchCivicBallot(address, apiKey) {
    const url = `${VOTERINFO_URL}?key=${encodeURIComponent(apiKey)}&address=${encodeURIComponent(address)}`;
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new CivicLookupError('Could not reach the ballot lookup service.', 'network');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
      const message = (body.error && body.error.message) || '';
      if (reason === 'parseError' || /address/i.test(message)) {
        throw new CivicLookupError('We could not find that address.', 'address');
      }
      if (reason === 'notFound' || /election/i.test(message)) {
        throw new CivicLookupError('No upcoming election data is available for this address yet.', 'no-election');
      }
      throw new CivicLookupError(message || `Lookup failed (${res.status}).`, 'network');
    }
    if (!body.election) {
      throw new CivicLookupError('No upcoming election data is available for this address yet.', 'no-election');
    }
    const data = toDistrictData(body);
    await attachStatements(data);
    return data;
  }

  // ---- Official voters' pamphlet statements (data/statements/{STATE}.json) ----
  // Statements are the candidates' own words, copied verbatim from the official
  // pamphlet, and are attached only on an unambiguous name (and office) match.

  const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

  function nameKey(name) {
    const parts = (name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/"[^"]*"|\([^)]*\)/g, ' ')      // drop nicknames in quotes/parens
      .replace(/[^a-z\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w && !NAME_SUFFIXES.has(w));
    // first + last name only, so middle names and initials don't block a match
    return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' ');
  }

  function officeTokens(text) {
    return new Set((text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 1 && !['of', 'the', 'and', 'for', 'no', 'position', 'district'].includes(w)));
  }

  function officeOverlap(a, b) {
    const ta = officeTokens(a), tb = officeTokens(b);
    let shared = 0;
    ta.forEach(t => { if (tb.has(t)) shared++; });
    return shared / Math.max(1, Math.min(ta.size, tb.size));
  }

  async function loadStatements(stateCode) {
    if (!/^[A-Z]{2}$/.test(stateCode || '')) return null;
    try {
      const res = await fetch(`./data/statements/${stateCode}.json`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  function findStatement(entries, candidateName, raceTitle) {
    const key = nameKey(candidateName);
    const byName = entries.filter(e => nameKey(e.name) === key);
    if (byName.length <= 1) {
      // A lone name match still has to be plausibly the same contest.
      return byName.find(e => !e.office || officeOverlap(e.office, raceTitle) >= 0.5) || null;
    }
    const ranked = byName
      .map(e => ({ e, score: officeOverlap(e.office, raceTitle) }))
      .sort((a, b) => b.score - a.score);
    // Ambiguous ties are left unmatched rather than risk the wrong statement.
    if (ranked[0].score >= 0.5 && ranked[0].score > ranked[1].score) return ranked[0].e;
    return null;
  }

  async function attachStatements(data) {
    const file = await loadStatements(data.stateCode);
    if (!file || !Array.isArray(file.statements)) return data;
    if (file.electionDate && data.election && file.electionDate !== data.election.date) return data;

    data.races.forEach(race => {
      if (race.category === 'Ballot Measure') return;
      race.candidates.forEach(c => {
        const st = findStatement(file.statements, c.name, race.title);
        const sources = st && (st.sources || []).filter(s => /^https?:\/\//i.test(s.url || ''));
        if (!st || !st.desc || !sources.length) return;
        c.desc = st.desc;
        if (st.summary) c.summary = st.summary;
        c.sources = sources;
        c.statementSource = file.publisher || '';
      });
    });
    return data;
  }

  window.CivicBallot = { fetchCivicBallot, toDistrictData, attachStatements, nameKey, CivicLookupError };
})();
