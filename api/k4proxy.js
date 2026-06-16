// K4 SOAP proxy — logs in to get a session cookie, then calls PublicationBasic server-side.
// Usage: GET /api/k4proxy?pubID=1591015400393

const K4_ORIGIN = 'https://accelerated-abeka-v16-k4.fluxcloud.us';
const K4_BASE   = `${K4_ORIGIN}/K4ServerABEKA/services/PublicationBasic`;
const K4_LOGIN  = `${K4_ORIGIN}/K4ServerABEKA/j_security_check`;
const K4_USER   = 'jordan jones';
const K4_PASS   = 'Minnesota58!';

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

// Extract all Set-Cookie values from a response and collapse into one Cookie header string.
function collectCookies(response) {
  const raw = response.headers.get('set-cookie') || '';
  // Node fetch may merge multiple Set-Cookie headers with commas; split carefully.
  return raw.split(/,(?=[^ ])/g)
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

module.exports = async function handler(req, res) {
  const { pubID } = req.query;
  if (!pubID) return res.status(400).json({ error: 'Missing pubID query param' });

  try {
    // Step 1: form-login to get JSESSIONID
    const loginRes = await fetch(K4_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `j_username=${encodeURIComponent(K4_USER)}&j_password=${encodeURIComponent(K4_PASS)}`,
      redirect: 'manual',
    });
    const cookies = collectCookies(loginRes);
    console.log('Login status:', loginRes.status, 'cookies:', cookies.slice(0, 120));

    // Step 2: SOAP call with session cookie (plus Basic auth as belt-and-suspenders)
    const K4_CREDS = Buffer.from(`${K4_USER}:${K4_PASS}`).toString('base64');
    const r = await fetch(K4_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${K4_CREDS}`,
        Cookie: cookies,
        'Content-Type': 'text/xml;charset=UTF-8',
        SOAPAction: 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
      },
      body: soapBody(pubID),
    });

    const xml = await r.text();
    console.log('SOAP status:', r.status, 'body prefix:', xml.slice(0, 200));
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 upstream error: ${e.message}` });
  }
};
