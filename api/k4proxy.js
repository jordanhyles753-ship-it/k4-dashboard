// K4 SOAP proxy — forwards PublicationBasic requests to the K4 server server-side,
// so the browser never hits CORS restrictions.
// Usage: GET /api/k4proxy?pubID=1591015400393

const K4_BASE = 'https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA/services/PublicationBasic';
const K4_CREDS = Buffer.from('jordan jones:Minnesota58!').toString('base64');

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

module.exports = async function handler(req, res) {
  const { pubID } = req.query;
  if (!pubID) return res.status(400).json({ error: 'Missing pubID query param' });

  try {
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
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(r.status).send(xml);
  } catch (e) {
    res.status(502).json({ error: `K4 upstream error: ${e.message}` });
  }
};
