// K4 SOAP proxy
// Session: pass ?session=JSESSIONID from the client (stored in dashboard localStorage)
//          OR set K4_SESSION Vercel environment variable as fallback.
//
// Usage:   GET /api/k4proxy?pubID=1591015400393&session=YOUR_JSESSIONID
// Health:  GET /api/k4proxy?ping=1

const K4_BASE = 'https://accelerated-abeka-v16-k4.fluxcloud.us/K4ServerABEKA';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // Health-check
  if (req.query.ping === '1') {
    const session = req.query.session || process.env.K4_SESSION || '';
    return res.status(200).json({
      hasSession: !!session,
      sessionPrefix: session ? session.slice(0, 6) + '...' : null,
    });
  }

  const { pubID } = req.query;
  if (!pubID) return res.status(400).json({ error: 'Missing pubID' });

  // Session: query param wins over env var
  const session = req.query.session || process.env.K4_SESSION || '';
  if (!session) {
    return res.status(503).json({ error: 'K4_SESSION_MISSING' });
  }

  try {
    const r = await fetch(`${K4_BASE}/services/PublicationBasic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
        'Cookie': `JSESSIONID=${session}`,
        'Origin': 'https://accelerated-abeka-v16-k4.fluxcloud.us',
        'Referer': `${K4_BASE}/admin/`,
      },
      body: issueSoap(pubID),
    });

    const xml = await r.text();
    const isExpired = xml.includes('errorCode>51') || xml.includes('session expired');
    console.log('SOAP status:', r.status, 'expired:', isExpired, 'prefix:', xml.slice(0, 80));

    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 proxy error: ${e.message}` });
  }
};
