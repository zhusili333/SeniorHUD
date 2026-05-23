// utils/ble.js
const protocol = require('./protocol.js');
const app = getApp();

// ESP32的BLE服务UUID（需与ESP32端代码一致）
const ESP32_SERVICE_UUID = '4FAFC201-1FB5-459E-8FCC-C5C9C331914B';
const ESP32_CHAR_UUID    = 'BEB5483E-36E1-4688-B7F5-EA07361B26A8';
// 设备名称前缀（用于扫描过滤）
const DEVICE_NAME_PREFIX = 'HUD';

/**
 * 初始化蓝牙适配器
 */
function initBluetooth() {
  return new Promise((resolve, reject) => {
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('蓝牙适配器初始化成功');
        resolve(res);
      },
      fail: (err) => {
        console.error('蓝牙初始化失败:', err);
        if (err.errCode === 10001) {
          reject(new Error('请先打开手机蓝牙'));
        } else {
          reject(err);
        }
      }
    });
  });
}

/**
 * 扫描BLE设备
 * @returns {Promise<Array>} 设备列表
 */
function scanDevices() {
  return new Promise((resolve, reject) => {
    const devices = [];

    // 监听发现设备
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach(device => {
        // 过滤：只显示有名称的设备，优先显示HUD设备
        if (device.name && device.name.length > 0) {
          // 避免重复
          const exists = devices.find(d => d.deviceId === device.deviceId);
          if (!exists) {
            devices.push({
              deviceId: device.deviceId,
              name: device.name,
              RSSI: device.RSSI,
              isHUD: device.name.toUpperCase().includes(DEVICE_NAME_PREFIX)
            });
            console.log('发现设备:', device.name, device.deviceId);
          }
        }
      });
    });

    // 开始扫描
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => {
        console.log('开始扫描BLE设备...');
        // 扫描5秒后停止并返回结果
        setTimeout(() => {
          wx.stopBluetoothDevicesDiscovery();
          console.log(`扫描完成，发现${devices.length}个设备`);
          resolve(devices);
        }, 5000);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 连接BLE设备
 * @param {string} deviceId 设备ID
 */
function connectDevice(deviceId) {
  return new Promise((resolve, reject) => {
    wx.createBLEConnection({
      deviceId: deviceId,
      timeout: 10000,
      success: (res) => {
        console.log('BLE连接成功:', deviceId);
        app.globalData.bleDeviceId = deviceId;
        
        // 连接成功后获取服务
        setTimeout(() => {
          getDeviceServices(deviceId).then(resolve).catch(reject);
        }, 1000);  // 延迟1秒再获取服务，确保连接稳定
      },
      fail: (err) => {
        console.error('BLE连接失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 获取设备服务和特征值
 */
function getDeviceServices(deviceId) {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceServices({
      deviceId: deviceId,
      success: (res) => {
        console.log('设备服务列表:', res.services);
        
        // 查找目标服务
        const targetService = res.services.find(s => 
          s.uuid.toUpperCase().includes(ESP32_SERVICE_UUID.substring(0, 8).toUpperCase())
        );

        if (!targetService) {
          // 如果找不到特定UUID，使用第一个非系统服务
          const customService = res.services.find(s => !s.uuid.startsWith('0000'));
          if (customService) {
            console.log('使用自定义服务:', customService.uuid);
            getCharacteristics(deviceId, customService.uuid).then(resolve).catch(reject);
          } else {
            reject(new Error('未找到合适的BLE服务'));
          }
          return;
        }

        app.globalData.bleServiceId = targetService.uuid;
        getCharacteristics(deviceId, targetService.uuid).then(resolve).catch(reject);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 获取特征值
 */
function getCharacteristics(deviceId, serviceId) {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceCharacteristics({
      deviceId: deviceId,
      serviceId: serviceId,
      success: (res) => {
        console.log('特征值列表:', res.characteristics);
        
        // 查找可写入的特征值
        const writeChar = res.characteristics.find(c => 
          c.properties.write || c.properties.writeNoResponse
        );

        if (writeChar) {
          app.globalData.bleServiceId = serviceId;
          app.globalData.bleCharacteristicId = writeChar.uuid;
          app.globalData.isConnected = true;
          console.log('BLE配置完成，可以开始通信');
          resolve({
            serviceId: serviceId,
            characteristicId: writeChar.uuid
          });
        } else {
          reject(new Error('未找到可写入的特征值'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 发送数据到ESP32
 * @param {string} data 字符串数据
 */
async function sendData(data) {
  if (!app.globalData.isConnected) {
    console.log('BLE未连接，跳过发送');
    return;
  }

  const deviceId = app.globalData.bleDeviceId;
  const serviceId = app.globalData.bleServiceId;
  const charId = app.globalData.bleCharacteristicId;

  // 分包发送（BLE MTU限制）
  const packets = protocol.splitPackets(data, 20);

  for (let i = 0; i < packets.length; i++) {
    try {
      await writeBLE(deviceId, serviceId, charId, packets[i]);
      // 每包间隔50ms，避免发送过快
      if (i < packets.length - 1) {
        await sleep(50);
      }
    } catch (err) {
      console.error(`发送第${i + 1}包失败:`, err);
      // 如果发送失败，标记为断开
      if (err.errCode === 10006 || err.errCode === 10004) {
        app.globalData.isConnected = false;
      }
      break;
    }
  }
}

/**
 * 写入BLE数据
 */
function writeBLE(deviceId, serviceId, charId, buffer) {
  return new Promise((resolve, reject) => {
    wx.writeBLECharacteristicValue({
      deviceId: deviceId,
      serviceId: serviceId,
      characteristicId: charId,
      value: buffer,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 断开连接
 */
function disconnect() {
  return new Promise((resolve) => {
    const deviceId = app.globalData.bleDeviceId;
    if (deviceId) {
      wx.closeBLEConnection({
        deviceId: deviceId,
        complete: () => {
          app.globalData.isConnected = false;
          app.globalData.bleDeviceId = null;
          app.globalData.bleServiceId = null;
          app.globalData.bleCharacteristicId = null;
          console.log('BLE已断开');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

/**
 * 关闭蓝牙适配器
 */
function closeBluetooth() {
  wx.closeBluetoothAdapter();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  initBluetooth,
  scanDevices,
  connectDevice,
  sendData,
  disconnect,
  closeBluetooth
};