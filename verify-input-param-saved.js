const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'mana',
  password: 'mana_local_dev',
  database: 'mana',
  ssl: false
});

async function verifyInputParamSaved() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Verifying if ephemeral memory inputParam was saved correctly...');
    
    // Get our flowData
    const result = await client.query(
      'SELECT "flowData" FROM chat_flow WHERE id = $1',
      ['ec813128-dbbc-4ffd-b834-cc15a361ccb1']
    );
    
    if (result.rows.length === 0) {
      console.error('❌ Our flow not found');
      return;
    }
    
    let flowData = JSON.parse(result.rows[0].flowData);
    
    // Find the Start node
    const startNode = flowData.nodes.find(node => node.data.name === 'startAgentflow');
    
    if (!startNode) {
      console.error('❌ Start node not found in our flow');
      return;
    }
    
    console.log('📝 Current Start node inputParams:');
    console.log(`Total inputParams: ${startNode.data.inputParams.length}`);
    
    let hasEphemeralMemory = false;
    
    startNode.data.inputParams.forEach((param, index) => {
      console.log(`\n${index + 1}. ${param.label || param.name}:`);
      console.log(`   Name: ${param.name}`);
      console.log(`   Type: ${param.type}`);
      console.log(`   Display: ${param.display}`);
      
      if (param.name === 'startEphemeralMemory') {
        hasEphemeralMemory = true;
        console.log('   ✅ FOUND: Ephemeral Memory inputParam');
        console.log(`   Description: ${param.description || 'No description'}`);
        console.log(`   Optional: ${param.optional || false}`);
      }
    });
    
    if (hasEphemeralMemory) {
      console.log('\n✅ SUCCESS: Ephemeral memory inputParam is present in the database');
      
      // Also check the inputs value
      const ephemeralValue = startNode.data.inputs.startEphemeralMemory;
      console.log(`\n📝 Current ephemeral memory value: ${ephemeralValue}`);
      
    } else {
      console.log('\n❌ PROBLEM: Ephemeral memory inputParam NOT found in the database');
      console.log('   This means the changes were not saved correctly');
    }
    
    console.log('\n📝 Full current inputParams structure:');
    console.log(JSON.stringify(startNode.data.inputParams, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyInputParamSaved();