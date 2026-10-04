#!/usr/bin/env node

/**
 * Script to fix temperature setting data_type in database
 * Ensures chat_temperature has data_type = 'number' instead of 'string'
 */

const { sequelize } = require('../src/config/database');
const Settings = require('../src/models/Settings');

async function fixTemperatureDataType() {
  try {
    console.log('🔧 Fixing chat_temperature data_type...');
    
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Update the setting to ensure correct data_type
    const [setting, created] = await Settings.upsert({
      key: 'chat_temperature',
      value: '0.7',
      category: 'chat',
      data_type: 'number',
      is_public: true,
      description: 'Temperature cho creativity (0.0 - 2.0)',
      default_value: '0.7'
    });
    
    if (created) {
      console.log('✅ Created new chat_temperature setting with data_type: number');
    } else {
      console.log('✅ Updated existing chat_temperature setting to data_type: number');
    }
    
    // Also update max_tokens to ensure it has correct data_type
    const [maxTokensSetting, maxTokensCreated] = await Settings.upsert({
      key: 'chat_max_tokens',
      value: '400000',
      category: 'chat',
      data_type: 'number',
      is_public: true,
      description: 'Số tokens tối đa cho response',
      default_value: '400000'
    });
    
    if (maxTokensCreated) {
      console.log('✅ Created new chat_max_tokens setting with data_type: number');
    } else {
      console.log('✅ Updated existing chat_max_tokens setting to data_type: number');
    }
    
    // Verify the updates
    const tempSetting = await Settings.findOne({ where: { key: 'chat_temperature' } });
    const maxTokensSetting2 = await Settings.findOne({ where: { key: 'chat_max_tokens' } });
    
    console.log(`✅ Temperature: ${tempSetting.value} (type: ${tempSetting.data_type}) -> parsed: ${tempSetting.getParsedValue()}`);
    console.log(`✅ Max Tokens: ${maxTokensSetting2.value} (type: ${maxTokensSetting2.data_type}) -> parsed: ${maxTokensSetting2.getParsedValue()}`);
    
    console.log('🎉 Settings data types fixed successfully!');
    console.log('💡 Please restart your backend server to apply changes.');
    
  } catch (error) {
    console.error('❌ Error fixing settings:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

fixTemperatureDataType();
