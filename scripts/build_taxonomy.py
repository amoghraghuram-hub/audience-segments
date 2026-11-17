"""Convert the Segments CSV into a compact JSON taxonomy for the segment builder.

Usage: python3 -I scripts/build_taxonomy.py <csv-path> <out-json-path>
Output shape:
{
  "version": "...", "generatedAt": "...",
  "countries": [{"code":"SGP","name":"Singapore"}, ...],
  "types": {"BRAND": {"label": "...", "group": "offline|demographic|online", ...}},
  "segments": {"SGP": {"BRAND": [[id, name, reach, desc], ...]}}
}
"""
import csv, json, sys, collections, datetime, re

COUNTRY_NAMES = {
 'USA':'United States','AUS':'Australia','KOR':'South Korea','THA':'Thailand','SGP':'Singapore','IND':'India',
 'CAN':'Canada','ESP':'Spain','GBR':'United Kingdom','MYS':'Malaysia','ITA':'Italy','NZL':'New Zealand','TWN':'Taiwan',
 'IDN':'Indonesia','PHL':'Philippines','HKG':'Hong Kong','ARE':'United Arab Emirates','JPN':'Japan','VNM':'Vietnam',
 'DEU':'Germany','NLD':'Netherlands','SAU':'Saudi Arabia','BRA':'Brazil','MEX':'Mexico','ARG':'Argentina','FRA':'France',
 'COL':'Colombia','CHL':'Chile','PER':'Peru','BEL':'Belgium','QAT':'Qatar','AUT':'Austria','ZAF':'South Africa',
 'KWT':'Kuwait','MCO':'Monaco','OMN':'Oman','BHR':'Bahrain'}

TYPES = {
 'BRAND':          {'label':'Brand visitors',        'group':'offline',     'hint':'Devices seen at a specific brand\'s locations in the last 90 days'},
 'CATEGORY':       {'label':'Place type visitors','group':'offline',    'hint':'Devices seen at a type of place (gyms, fine dining, pet stores…) in the last 90 days'},
 'GEO_BEHAVIOUR':  {'label':'Lifestyle audiences',         'group':'offline',     'hint':'Kinds of people, inferred from patterns of visits (frequent gym-goers, home movers, in-market buyers…)'},
 'AGE':            {'label':'Age range',             'group':'demographic', 'hint':'Users who belong to an age range'},
 'GENDER':         {'label':'Gender',                'group':'demographic', 'hint':'Users classified by gender'},
 'DEVICE_CARRIER': {'label':'Mobile carrier',        'group':'demographic', 'hint':'Devices seen on a specific mobile carrier'},
 'INTENT':         {'label':'Purchase intent',       'group':'online',      'hint':'Devices with e-commerce and purchase behaviour in a category'},
 'IAB_CATEGORY':   {'label':'Content interest (IAB)','group':'online',      'hint':'Devices seen browsing content in an IAB category'},
 'ONLINE_BRAND':   {'label':'Online brand affinity', 'group':'online',      'hint':'Devices seen browsing websites and content related to a brand'},
 'EVENTS':         {'label':'Online interest events','group':'online',      'hint':'Devices seen browsing content related to an interest or event'},
 'APP_CATEGORY':   {'label':'App category',          'group':'online',      'hint':'Devices seen with apps of a category installed'},
}

def clean(s): return re.sub(r'\s+',' ', s or '').strip()

def main(src, dst):
    rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))
    seg = collections.defaultdict(lambda: collections.defaultdict(list))
    seen=set(); dupes=0
    for r in rows:
        key=(r['country'], r['segmentId'])
        if key in seen: dupes+=1; continue
        seen.add(key)
        try: reach=int(float(r['deviceReach'] or 0))
        except ValueError: reach=0
        seg[r['country']][r['type']].append([r['segmentId'], clean(r['segmentName']), reach, clean(r['description'])])
    for c in seg:
        for t in seg[c]:
            seg[c][t].sort(key=lambda x: -x[2])
    countries=[{'code':c,'name':COUNTRY_NAMES.get(c,c),'segments':sum(len(v) for v in seg[c].values())}
               for c in sorted(seg, key=lambda c: -sum(len(v) for v in seg[c].values()))]
    out={'version': 'Segments_v2.86','generatedAt': datetime.date.today().isoformat(),
         'lookbackDays': 90,'countries':countries,'types':TYPES,'segments':seg}
    json.dump(out, open(dst,'w'), separators=(',',':'), ensure_ascii=False)
    print('rows',len(rows),'dupes skipped',dupes,'countries',len(countries))
    unknown=set(t for c in seg for t in seg[c]) - set(TYPES); print('unknown types', unknown)

if __name__=='__main__': main(sys.argv[1], sys.argv[2])
