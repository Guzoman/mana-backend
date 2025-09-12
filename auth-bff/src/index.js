import express from express;
import cors from cors;

const app = express();
app.use(express.json());

// CORS simple
app.use(cors({ origin: true, credentials: true }));
app.options(*, cors());

app.get(/health, (_req, res) => res.json({ ok: true }));

app.post(/api/rpc/echo, (req, res) => {
 const { op, userId } = req.body ?? {};
  
  // Handle validation operation - proxy to Flowise
  if (op === 'flowise.validate') {
    console.log('🔧 Flowise validation request:', { userId, op });
    
    // Call Flowise API with the chatflow ID
    return fetch('http://flowise:3001/api/v1/prediction/ec813128-dbbc-4ffd-b834-cc15a361ccb1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: "",
        overrideConfig: {
          vars: {
            userId: userId || null,
            userLanguage: "es",
            debugCase: userId ? (userId === 'invalid-uuid-format' ? 'ERR_INVALID' : 
                           userId === '11111111-2222-4333-8444-555555555555' ? 'ERR_NOT_FOUND' :
                           userId === '550e8400-e29b-41d4-a716-446655440001' ? 'OK_KNOWN' : 'OK_NEW')
          }
        }
      })
    })
    .then(flowiseResponse => {
      if (!flowiseResponse.ok) {
        throw new Error(`Flowise error: ${flowiseResponse.status}`);
      }
      return flowiseResponse.json();
    })
    .then(flowiseData => {
      console.log('🔧 Flowise response:', flowiseData);
      
      // Transform Flowise response to expected format
      return res.json({
        ok: true,
        result: {
          text: flowiseData.text || JSON.stringify(flowiseData),
          data: flowiseData
        }
      });
    })
    .catch(error => {
      console.error('🔧 Flowise proxy error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    });
  }
  
  // Default echo behavior for other operations
  res.json({ ok: true, echo: { op, userId }, timestamp: new Date().toISOString() });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`auth-bff listening on :${port}`));
