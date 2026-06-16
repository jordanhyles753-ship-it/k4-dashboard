// K4 SOAP proxy — uses WS-Security UsernameToken for authentication.
// Usage: GET /api/k4proxy?pubID=1591015400393

const K4_BASE  = 'https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA/services/PublicationBasic';
const K4_USER  = 'jordan jones';
const K4_PASS  = 'Minnesota58!';

const soapBody = pubID => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pt="http://www.vjoon.com/ps/core/publication/wstypes/"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>${K4_USER}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${K4_PASS}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
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
    const K4_CREDS = Buffer.from(`${K4_USER}:${K4_PASS}`).toString('base64');
    const r = await fetch(K4_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${K4_CREDS}`,
        'Content-Type': 'text/xml;charset=UTF-8',
        SOAPAction: 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
      },
      body: soapBody(pubID),
    });

    const xml = await r.text();
    console.log('SOAP status:', r.status, 'prefix:', xml.slice(0, 300));
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 upstream error: ${e.message}` });
  }
};
