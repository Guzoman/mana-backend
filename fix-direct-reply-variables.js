const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixDirectReplyVariables() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing DirectReply variables to match LoadUserData output...');
    
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
    
    console.log('🔧 Found DirectReply node, updating variables...');
    
    // Update the DirectReply message to use correct variable names (without $ prefix)
    directReplyNode.data.inputs.directReplyMessage = `🔧 **DEBUG DE AUTENTICACIÓN**

**Caso:** {{ case }}
**Debug Case:** {{ debugCase }}
**User ID:** {{ userId }}
**Exists:** {{ exists }}
**Valid:** {{ isValid }}
**Error:** {{ error }}
**Language:** {{ userLanguage }}

**Player Data:**
\`\`\`json
{{ playerData }}
\`\`\`

**Timestamp:** {{ timestamp }}`;
    
    console.log('📝 DirectReply node updated with correct variables:');
    console.log('  - Changed from {{$case}} to {{case}}');
    console.log('  - Changed from {{$userId}} to {{userId}}');
    console.log('  - Changed from {{$debugCase}} to {{debugCase}}');
    console.log('  - All variables now match LoadUserData output');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ DirectReply variables fixed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDirectReplyVariables();