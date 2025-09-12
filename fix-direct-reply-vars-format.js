const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixDirectReplyWithVarsFormat() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing DirectReply to use $vars format...');
    
    // Get the current flowData
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    if (result.rows.length === 0) {
      console.error('❌ Chatflow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find the DirectReply node
    const directReplyNode = flowData.nodes.find(node => node.data.name === 'directReplyAgentflow');
    
    if (!directReplyNode) {
      console.error('❌ DirectReply node not found');
      return;
    }
    
    console.log('🔧 Found DirectReply node, updating to $vars format...');
    
    // Update the DirectReply message to use $vars format (Flowise standard)
    directReplyNode.data.inputs.directReplyMessage = `🔧 **DEBUG DE AUTENTICACIÓN**

**Caso:** {{ $vars.case }}
**Debug Case:** {{ $vars.debugCase }}
**User ID:** {{ $vars.userId }}
**Exists:** {{ $vars.exists }}
**Valid:** {{ $vars.isValid }}
**Error:** {{ $vars.error }}
**Language:** {{ $vars.userLanguage }}

**Player Data:**
\`\`\`json
{{ $vars.playerData }}
\`\`\`

**Timestamp:** {{ $vars.timestamp }}`;
    
    console.log('📝 DirectReply node updated with $vars format:');
    console.log('  - Using Flowise standard: {{$vars.variable}}');
    console.log('  - This should match the variables set in LoadUserData');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ DirectReply updated with $vars format!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDirectReplyWithVarsFormat();