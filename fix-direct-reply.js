const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixDirectReplyNode() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing DirectReply node...');
    
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
    
    console.log('🔧 Found DirectReply node, updating message...');
    
    // Update the DirectReply message to show the actual debug results with error messages
    // Using the variables from the CustomFunction output
    directReplyNode.data.inputs.directReplyMessage = `🔍 **RESULTADO DE VALIDACIÓN**

**Caso:** {{ case }}
**User ID:** {{ userId }}
**Estado:** {{ exists ? 'EXISTS' : 'NEW' }}
**Válido:** {{ isValid ? 'YES' : 'NO' }}

{{#if error}}
❌ **ERROR:** {{ error }}
{{/if}}

{{#if proposedUserId}}
📝 **User ID Propuesto:** {{ proposedUserId }}
{{/if}}

{{#if playerData}}
👤 **Datos del Usuario:**
\`\`\`json
{{ playerData }}
\`\`\`
{{/if}}

**Idioma:** {{ userLanguage }}
**Timestamp:** {{ timestamp }}`;
    
    console.log('📝 DirectReply node updated with proper debug messages');
    console.log('  - Shows actual validation results');
    console.log('  - Displays error messages for each case');
    console.log('  - Uses conditional logic for different scenarios');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ DirectReply node fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDirectReplyNode();