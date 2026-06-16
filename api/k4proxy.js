// K4 SOAP proxy — establishes a K4 session by following the login flow,
// then calls PublicationBasic with the resulting session cookie.
// Usage: GET /api/k4proxy?pubID=1591015400393

const K4_ORIGIN = 'https://accelerated-abeka-v16-k4.fluxcloud.us';
const K4_BASE   = `${K4_ORIGIN}/K4ServerABEKA/services/PublicationBasic`;
const K4_USER   = 'jordan jones';
const K4_PASS   = 'Minnesota58!';
const K4_CREDS  = Buffer.from(`${K4_USER}:${K4_PASS}`).toString('base64');

const soapBody = pubID => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pt="http://www.vjoon.com/ps/core/publication/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <pt:getIssuesByPublicationID1Request>
      <pt:publicationID>${pubID}</pt:publicationID>
    </pt:getIssuesByPublicationID1Request>
  </soapenv:Body>
</soapenv:Envelope>`;

// Pull all JSESSIONID / cookie values from a Headers object.
function extractCookies(headers) {
  const raw = headers.get('set-cookie') || '';
  return raw.split(/,(?=[^ ])/g)
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

// Establish a K4 session: GET the root page (or any protected page) with Basic auth.
// K4's Java EE container will authenticate, create a session, and set JSESSIONID.
async function getK4Session() {
  // Try fetching any protected resource — container auth creates a session
  const r = await fetch(`${K4_ORIGIN}/K4ServerABEKA/`, {
    headers: {
      Authorization: `Basic ${K4_CREDS}`,
      Accept: 'text/html',
    },
    redirect: 'manual',
  });
  const cookies = extractCookies(r.headers);
  console.log('Session init:', r.status, 'cookies:', cookies.slice(0, 150));

  // If redirected (302/301), follow once more to catch session cookie
  if ((r.status === 301 || r.status === 302 || r.status === 303) && !cookies.includes('JSESSIONID')) {
    const loc = r.headers.get('location') || '';
    const target = loc.startsWith('http') ? loc : `${K4_ORIGIN}${loc}`;
    const r2 = await fetch(target, {
      headers: { Authorization: `Basic ${K4_CREDS}`, Accept: 'text/html' },
      redirect: 'manual',
    });
    const cookies2 = extractCookies(r2.headers);
    console.log('Session follow:', r2.status, 'cookies:', cookies2.slice(0, 150));
    return (cookies2 || cookies) || '';
  }
  return cookies;
}

module.exports = async function handler(req, res) {
  const { pubID } = req.query;
  if (!pubID) return res.status(400).json({ error: 'Missing pubID query param' });

  try {
    const sessionCookies = await getK4Session();

    const r = await fetch(K4_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${K4_CREDS}`,
        ...(sessionCookies ? { Cookie: sessionCookies } : {}),
        'Content-Type': 'text/xml;charset=UTF-8',
        SOAPAction: 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
      },
      body: soapBody(pubID),
    });

    const xml = await r.text();
    console.log('SOAP status:', r.status, 'prefix:', xml.slice(0, 250));
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 upstream error: ${e.message}` });
  }
};
