const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function checkDirectReplyNode() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Chatflow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find all nodes to check the DirectReply node name
    console.log('🔍 All nodes in the flow:');
    flowData.nodes.forEach(node => {
      console.log(`- ${node.id}: ${node.data.name} (label: ${node.data.label || 'no label'})`);
    });
    
    // Find the DirectReply node (whatever its current name)
    const directReplyNode = flowData.nodes.find(node => 
      node.data.name === 'directReplyAgentflow' || 
      node.data.label?.toLowerCase().includes('direct') ||
      node.data.label?.toLowerCase().includes('reply')
    );
    
    if (directReplyNode) {
      console.log('\n📝 DirectReply node found:');
      console.log(`- ID: ${directReplyNode.id}`);
      console.log(`- Name: ${directReplyNode.data.name}`);
      console.log(`- Label: ${directReplyNode.data.label || 'no label'}`);
      console.log(`- Message: ${directReplyNode.data.inputs.directReplyMessage?.substring(0, 100)}...`);
    } else {
      console.log('\n❌ DirectReply node not found');
    }
    
    // Check connections to see how routing works
    console.log('\n🔗 Flow edges (connections):');
    flowData.edges.forEach(edge => {
      const sourceNode = flowData.nodes.find(n => n.id === edge.source);
      const targetNode = flowData.nodes.find(n => n.id === edge.target);
      console.log(`- ${sourceNode?.data.name || sourceNode?.id} → ${targetNode?.data.name || targetNode?.id}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDirectReplyNode();