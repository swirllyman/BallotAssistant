#!/usr/bin/env python3
"""Build a Washington ZIP ballot file from the Secretary of State's official
online voters' pamphlet (VoteWA). Only official text is used: candidate
statements and measure text/arguments are copied verbatim, with a link back to
the pamphlet page they came from. No summaries, pros/cons or statistics are added.

Usage:  python3 scripts/build_wa_votewa.py            # writes public/data/zips/98116.json
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://voter.votewa.gov/elections"
ELECTION_ID = "899"          # GENERAL 2026 (Nov 3, 2026)
COUNTY = "17"                # King County
GUIDE_URL = f"https://voter.votewa.gov/GenericVoterGuide.aspx?e={ELECTION_ID}&c={COUNTY}&language=en"
KC_CANDIDATES_URL = "https://info.kingcounty.gov/kcelections/Vote/contests/candidates.aspx?eid=55"

# Contests on a West Seattle (98116) ballot: LD 34, CD 7, King County Council
# District 8, King County District Court West Electoral District, City of Seattle.
# IDs are VoteWA race/measure IDs, in the order VoteWA lists them.
ZIP_98116 = {
    "measures": ["7325", "7326", "7327", "7258"],
    "races": [
        "186953",                                   # U.S. Rep, CD 7
        "187035", "187036", "187037",               # LD 34
        "187079", "187080", "187081", "187082", "187083",  # Supreme Court
        "187084", "187085",                         # Court of Appeals Div 1 Dist 1
        "186671", "186672", "186673", "186677",     # KC Prosecutor, Assessor, Elections, Council D8
        "186698", "186699", "186700", "186701", "186702",  # District Court West
        "186704", "186705", "186706", "186707", "186708", "186709", "186710",  # Seattle Municipal Court
    ],
}


def get_json(path, **params):
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (BallotAssistant data build)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def text_from_html(s):
    """Turn pamphlet HTML into plain paragraphs separated by blank lines."""
    if not s:
        return ""
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</(p|div|li|h\d|tr)>", "\n\n", s)
    s = re.sub(r"(?i)<li[^>]*>", "• ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    paras = []
    for block in re.split(r"\n\s*\n", s):
        lines = [re.sub(r"[ \t]+", " ", l).strip() for l in block.split("\n")]
        block = "\n".join(l for l in lines if l)
        if block:
            paras.append(block)
    return "\n\n".join(paras)


def one_line(s):
    return re.sub(r"\s+", " ", text_from_html(s)).strip()


def party_class(party):
    p = party.lower()
    if "democrat" in p:
        return "party-dem"
    if "republican" in p:
        return "party-rep"
    if party:
        return "party-ind"
    return ""


def site_url(w):
    w = (w or "").strip()
    if not w:
        return ""
    return w if re.match(r"^https?://", w, re.I) else "https://" + w


def short_title(race):
    name, juris = race["Name"], race.get("Jurisdiction") or ""
    if name == "U.S. Representative":
        return "US Rep " + juris.replace("Congressional District", "CD")
    if juris.startswith("Legislative District"):
        ld = juris.replace("Legislative District ", "LD ")
        return f"{ld} {name.replace('State Representative', 'Rep').replace('State Senator', 'Senator')}"
    if juris == "Supreme Court":
        return "Supreme Court " + name.replace("Justice Position #0", "Pos. ").replace("Justice Position #", "Pos. ")
    if juris.startswith("Court Of Appeals"):
        return "Appeals Court " + name.replace("Judge Position", "Pos.")
    if juris == "West Electoral District":
        return "District Court " + name.replace("Judge Position No.", "Pos.")
    if juris == "City Of Seattle":
        return "Seattle Muni Court " + name.replace("Municipal Court Judge Position No.", "Pos.")
    if name.startswith("Metropolitan King County Council"):
        return "KC Council Dist 8"
    return "King County " + name


def full_title(race):
    name, juris = race["Name"], race.get("Jurisdiction") or ""
    if name == "U.S. Representative":
        return f"United States Representative, {juris}"
    if juris.startswith("Legislative District"):
        return f"{juris}, {name.replace('Pos.', 'Position No.')}"
    if juris == "Supreme Court":
        return "State Supreme Court, " + name.replace("#0", "No. ").replace("#", "No. ")
    if juris.startswith("Court Of Appeals"):
        return "Court of Appeals, Division 1, District 1, " + name.replace("Position", "Position No.")
    if juris == "West Electoral District":
        return "King County District Court, West Electoral District, " + name
    if juris == "City Of Seattle":
        return "City of Seattle, " + name
    if name.startswith("Metropolitan King County Council"):
        return name
    return "King County " + name


def category(race_cat):
    return {"FED": "Federal Office", "LEG": "State Legislature", "JUD": "State Courts"}.get(race_cat, "King County & Seattle")


def build_race(race, cat_code):
    rid = race["RaceID"]
    partisan = cat_code in ("FED", "LEG")
    cands = []
    for c in race["Candidates"]:
        if not c["BallotName"]:
            continue
        prof = get_json("candidate.ashx", e=ELECTION_ID, r=rid, b=c["BallotID"], la="en", c=COUNTY)
        st = prof[0]["statement"] if prof else {}
        page = f"{GUIDE_URL}#/candidates/{rid}/{c['BallotID']}"
        party = (c.get("PartyName") or "").strip().strip("()")
        cand = {
            "name": c["BallotName"],
            "party": party,
            "partyClass": party_class(party) if partisan else "",
            "desc": text_from_html(st.get("Statement", "")),
            "sources": [{"label": "WA Voters' Pamphlet (candidate statement)", "url": page}],
            "site": site_url(st.get("OrgWebsite")),
        }
        if not cand["desc"]:
            del cand["desc"]
        if st.get("OrgEmail"):
            cand["email"] = st["OrgEmail"].strip()
        if st.get("OrgPhone"):
            cand["phone"] = st["OrgPhone"].strip()
        if not party:
            del cand["party"], cand["partyClass"]
        cands.append(cand)
    n = len(cands)
    office_type = {"FED": "Federal Partisan Office", "LEG": "State Partisan Office"}.get(cat_code, "Nonpartisan Office")
    term = (race.get("TermFullLabel") or "").strip()
    unopposed = " • Unopposed" if n == 1 else ""
    return {
        "shortTitle": short_title(race),
        "type": f"{office_type} • Vote for One{unopposed}",
        "category": category(cat_code),
        "title": full_title(race),
        **({"overview": f"{term}. Candidate statements below are copied from the official voters' pamphlet; candidates write their own statements and election officials do not verify them."} if term else {}),
        "sources": [
            {"label": "WA Voters' Pamphlet: this contest", "url": f"{GUIDE_URL}#/candidates/{rid}"},
            {"label": "King County Elections candidate list", "url": KC_CANDIDATES_URL},
        ],
        "candidates": cands,
    }


def build_measure(mid, summary):
    m = get_json("measure.ashx", m=mid, e=ELECTION_ID, la="en", c=COUNTY)
    page = f"{GUIDE_URL}#/measure/{mid}"
    name = summary["Name"]
    details = {
        "pro": text_from_html(m.get("ArgumentFor")),
        "con": text_from_html(m.get("ArgumentAgainst")),
        "explanatory": text_from_html(m.get("ExplanatoryStatement")),
        "fiscal": text_from_html(m.get("FiscalStatement")),
        "rebuttalFor": text_from_html(m.get("RebuttalFor")),
        "rebuttalAgainst": text_from_html(m.get("RebuttalAgainst")),
    }
    details = {k: v for k, v in details.items() if v}
    sources = [{"label": "WA Voters' Pamphlet: this measure", "url": page}]
    if (m.get("FullTextURL") or "").strip():
        sources.append({"label": "Full text", "url": m["FullTextURL"].strip()})
    if name.startswith("Statewide"):
        short = name.replace("Statewide - Initiative Measure No. ", "Initiative ")
        title = name.replace("Statewide - ", "State ")
    else:
        short = "Seattle Prop 1" if "Seattle" in name else name
        title = f"{name}: {summary.get('ShortDescription') or ''}".strip(": ")
    return {
        "shortTitle": short,
        "type": "Ballot Measure • " + ("Statewide" if name.startswith("Statewide") else "Local"),
        "category": "Ballot Measure",
        "title": title,
        "overview": one_line(m.get("BallotTitle")) or summary.get("ShortDescription", ""),
        "sources": sources,
        "details": details,
        "candidates": [
            {"name": summary.get("TextFor") or "Yes"},
            {"name": summary.get("TextAgainst") or "No"},
        ],
    }


def main():
    guide = get_json("voterguide.ashx", e=ELECTION_ID, la="en", c=COUNTY, p="")
    by_id = {}
    for cat in guide["Categories"]:
        for r in cat["Races"]:
            by_id[r["RaceID"]] = (cat["CategoryCode"], r)
    races = []
    for mid in ZIP_98116["measures"]:
        races.append(build_measure(mid, by_id[mid][1]))
    for rid in ZIP_98116["races"]:
        cat, r = by_id[rid]
        races.append(build_race(r, cat))
    out = {
        "state": "Washington",
        "locationName": "Seattle, WA (West Seattle)",
        "districtText": "Legislative District 34 | Congressional District 7 | King County Council District 8 | City of Seattle",
        "election": {"name": "2026 Washington General Election", "date": "2026-11-03", "type": "general"},
        "votingInfo": {
            "ballotInfoUrl": "https://voter.votewa.gov/WhereToVote.aspx",
            "registrationUrl": "https://voter.votewa.gov/WhereToVote.aspx",
            "electionInfoUrl": "https://kingcounty.gov/en/dept/elections",
            "hasDropOff": True,
        },
        "dataNote": "Built from the Washington Secretary of State's online voters' pamphlet (VoteWA, election 899, King County) by scripts/build_wa_votewa.py. Check your own ballot at voter.votewa.gov.",
        "races": races,
    }
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "public/data/zips/98116.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {dest}: {len(races)} contests")


if __name__ == "__main__":
    main()
