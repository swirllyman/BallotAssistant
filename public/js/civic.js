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
    return toDistrictData(body);
  }

  window.CivicBallot = { fetchCivicBallot, toDistrictData, CivicLookupError };
})();
