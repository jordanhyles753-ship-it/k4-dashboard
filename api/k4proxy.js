// K4 SOAP proxy — authenticates via K4's own SOAP login (UserBasic service),
// then calls PublicationBasic with the resulting session cookie.
// Usage: GET /api/k4proxy?pubID=1591015400393

const K4_BASE   = 'https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA';
const K4_USER   = 'jordan jones';
const K4_PASS   = 'Minnesota58!';

// Extract all Set-Cookie values from a response headers object.
function parseCookies(headers) {
  // Node fetch may fold Set-Cookie into a comma-separated string or expose raw
  const raw = headers.get('set-cookie') || '';
  return raw
    .split(/,(?=\s*\w+=)/g)           // split on commas that start a new cookie
    .map(c => c.split(';')[0].trim()) // keep only name=value, strip attributes
    .filter(Boolean)
    .join('; ');
}

// Step 1 + 2: SOAP login → returns cookie string for subsequent calls
async function k4Login() {
  const beginBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wt="http://www.vjoon.com/ps/core/user/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <wt:beginLogInAllPublications1Request>
      <wt:domain></wt:domain>
      <wt:userName>${K4_USER}</wt:userName>
      <wt:password>${K4_PASS}</wt:password>
    </wt:beginLogInAllPublications1Request>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r1 = await fetch(`${K4_BASE}/services/UserBasic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': 'http://www.vjoon.com/k4/user/basic/beginLogInAllPublications1',
    },
    body: beginBody,
  });

  const cookies = parseCookies(r1.headers);
  const xml1    = await r1.text();
  const ucidMatch = xml1.match(/useCaseInstanceID[^>]*>(\d+)/);
  if (!ucidMatch) throw new Error('beginLogIn returned no useCaseInstanceID: ' + xml1.slice(0, 300));
  const ucid = ucidMatch[1];
  console.log('beginLogIn ucid:', ucid, 'cookies:', cookies.slice(0, 80));

  // Step 2: endLogIn
  const endBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wt="http://www.vjoon.com/ps/core/user/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <wt:endLogIn1Request>
      <wt:useCaseInstanceID>${ucid}</wt:useCaseInstanceID>
    </wt:endLogIn1Request>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r2 = await fetch(`${K4_BASE}/services/UserBasic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': 'http://www.vjoon.com/k4/user/basic/endLogIn1',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: endBody,
  });

  const xml2 = await r2.text();
  const cookies2 = parseCookies(r2.headers) || cookies;
  console.log('endLogIn status:', r2.status, 'fault?', xml2.includes('Fault'));

  if (xml2.includes('Fault')) throw new Error('endLogIn fault: ' + xml2.slice(0, 300));
  return cookies2 || cookies;
}

// Step 3: query issues for a publication
const issueSoap = pubID => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pt="http://www.vjoon.com/ps/core/publication/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <pt:getIssuesByPublicationID1Request>
      <pt:publicationID>${pubID}</pt:publicationID>
    </pt:getIssuesByPublicationID1Request>
  </soapenv:Body>
</soapenv:Envelope>`;

module.exports = async function handler(req, res) {
  const { pubID } = req.query;
  if (!pubID) return res.status(400).json({ error: 'Missing pubID query param' });

  try {
    const session = await k4Login();

    const r = await fetch(`${K4_BASE}/services/PublicationBasic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
        ...(session ? { Cookie: session } : {}),
      },
      body: issueSoap(pubID),
    });

    const xml = await r.text();
    console.log('SOAP status:', r.status, 'fault?', xml.includes('Fault'), 'prefix:', xml.slice(0, 120));

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 proxy error: ${e.message}` });
  }
};
