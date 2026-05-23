// app.js
App({
    globalData: {
      amapKey: 'b4a5dcb440437c215acd5799ace69127',        // 替换为你的Key
      bleDeviceId: null,              // 蓝牙设备ID
      bleServiceId: null,             // 蓝牙服务ID
      bleCharacteristicId: null,      // 蓝牙特征值ID
      isConnected: false,             // 蓝牙连接状态
      currentLocation: null,          // 当前位置
      navigationData: null            // 当前导航数据
    },
  
    onLaunch() {
      console.log('适老化HUD导航系统启动');
    }
  });