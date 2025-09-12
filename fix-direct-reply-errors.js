const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function fixDirectReplyForErrors() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing DirectReply node for error cases only...');
    
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
    
    console.log('🔧 Found DirectReply node, updating for error cases only...');
    
    // Update the DirectReply message to only show error messages
    // OK_NEW and OK_KNOWN should go to router, not show here
    directReplyNode.data.inputs.directReplyMessage = `❌ **ERROR DE VALIDACIÓN**

**Caso:** {{ case }}
**User ID:** {{ userId }}

{{#if error}}
**Mensaje:** {{ error }}
{{/if}}

Por favor, verifica el User ID e intenta nuevamente.`;
    
    console.log('📝 DirectReply node updated for error cases only');
    console.log('  - Only shows error messages for ERR_INVALID and ERR_NOT_FOUND');
    console.log('  - OK_NEW and OK_KNOWN cases should go to router');
    console.log('  - Other cases are ignored (will go to router)');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ DirectReply node fixed for error cases only!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDirectReplyForErrors();