const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function simplifyDirectReply() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Simplifying DirectReply message for testing...');
    
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
    
    console.log('🔧 Found DirectReply node, simplifying message...');
    
    // Simplify the message to test basic variable substitution
    directReplyNode.data.inputs.directReplyMessage = `DEBUG TEST

Case: {{case}}
User ID: {{userId}}
Debug Case: {{debugCase}}

This is a test to see if variables work.`;
    
    console.log('📝 DirectReply message simplified for testing');
    
    // Save the updated flowData
    await client.query(
      'UPDATE chat_flow SET "flowData" = $1, "updatedDate" = NOW() WHERE id = $2',
      [JSON.stringify(flowData), 'ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    console.log('✅ DirectReply message simplified!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

simplifyDirectReply();