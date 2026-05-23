// pages/bluetooth/bluetooth.js
const ble = require('../../utils/ble.js');
const protocol = require('../../utils/protocol.js');
const app = getApp();

Page({
  data: {
    scanning: false,
    isConnected: false,
    connectedName: '',
    devices: [],
    testResult: ''
  },

  onLoad() {
    this.setData({
      isConnected: app.globalData.isConnected
    });
  },

  onShow() {
    this.setData({
      isConnected: app.globalData.isConnected
    });
  },

  /**
   * 扫描设备
   */
  async onScan() {
    this.setData({ scanning: true, devices: [] });

    try {
      // 初始化蓝牙
      await ble.initBluetooth();
      
      wx.showLoading({ title: '扫描中(5秒)...' });

      // 扫描设备
      const devices = await ble.scanDevices();
      
      // HUD设备排在前面
      devices.sort((a, b) => {
        if (a.isHUD && !b.isHUD) return -1;
        if (!a.isHUD && b.isHUD) return 1;
        return b.RSSI - a.RSSI;  // 信号强的排前面
      });

      this.setData({ devices });

      if (devices.length === 0) {
        wx.showToast({ title: '未发现设备', icon: 'none' });
      } else {
        wx.showToast({ title: `发现${devices.length}个设备`, icon: 'none' });
      }
    } catch (err) {
      console.error('扫描失败:', err);
      wx.showModal({
        title: '扫描失败',
        content: err.message || '请确保蓝牙已开启',
        showCancel: false
      });
    } finally {
      this.setData({ scanning: false });
      wx.hideLoading();
    }
  },

  /**
   * 连接设备
   */
  async onConnect(e) {
    const index = e.currentTarget.dataset.index;
    const device = this.data.devices[index];

    wx.showLoading({ title: '连接中...' });

    try {
      await ble.connectDevice(device.deviceId);
      
      this.setData({
        isConnected: true,
        connectedName: device.name
      });

      wx.showToast({ title: '连接成功！', icon: 'success' });

      // 监听断开事件
      wx.onBLEConnectionStateChange((res) => {
        if (!res.connected) {
          console.log('BLE连接断开');
          app.globalData.isConnected = false;
          this.setData({ isConnected: false, connectedName: '' });
          wx.showToast({ title: '设备已断开', icon: 'none' });
        }
      });

    } catch (err) {
      console.error('连接失败:', err);
      wx.showModal({
        title: '连接失败',
        content: err.message || '请重试',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 断开连接
   */
  async onDisconnect() {
    await ble.disconnect();
    this.setData({
      isConnected: false,
      connectedName: ''
    });
    wx.showToast({ title: '已断开', icon: 'none' });
  },

  /**
   * 发送测试数据
   */
  async onTestSend() {
    const testData = protocol.packNavigationData({
      turnType: 'turn-left',
      distance: '200米',
      instruction: '前方路口左转',
      road: '测试路',
      speed: 40,
      remainDistance: '5.2公里',
      remainTime: '12分钟',
      alert: '注意限速60km/h'
    });

    console.log('发送测试数据:', testData);

    try {
      await ble.sendData(testData);
      this.setData({
        testResult: '✅ 发送成功！数据: ' + testData.substring(0, 50) + '...'
      });
    } catch (err) {
      this.setData({
        testResult: '❌ 发送失败: ' + (err.message || err)
      });
    }
  }
});