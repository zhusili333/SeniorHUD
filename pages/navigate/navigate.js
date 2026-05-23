// pages/navigate/navigate.js
const amap = require('../../utils/amap.js');
const traffic = require('../../utils/traffic.js');
const protocol = require('../../utils/protocol.js');
const ble = require('../../utils/ble.js');
const app = getApp();

Page({
  data: {
    // 地图
    latitude: 0,
    longitude: 0,
    markers: [],
    polyline: [],
    includePoints: [],

    // 导航信息
    currentStep: {},
    nextStep: null,
    remainDistance: '--',
    remainTime: '--',
    currentSpeed: 0,
    stepIndex: 0,

    // 交规提醒
    trafficAlert: null,

    // 连接状态
    isConnected: false,
    isSending: false
  },

  // 路线规划原始数据
  routeSteps: [],
  routePolyline: [],        // 完整路线坐标
  destLng: 0,
  destLat: 0,
  destName: '',
  locationTimer: null,       // 定时获取位置的计时器
  sendTimer: null,           // 定时发送数据的计时器

  onLoad(options) {
    // 接收首页传来的参数
    const { originLng, originLat, destLng, destLat, destName } = options;
    
    this.destLng = parseFloat(destLng);
    this.destLat = parseFloat(destLat);
    this.destName = decodeURIComponent(destName);

    this.setData({
      latitude: parseFloat(originLat),
      longitude: parseFloat(originLng),
      isConnected: app.globalData.isConnected
    });

    // 开始路线规划
    this.planRoute(
      `${originLng},${originLat}`,
      `${destLng},${destLat}`
    );
  },

  onUnload() {
    // 页面卸载时清除定时器
    if (this.locationTimer) clearInterval(this.locationTimer);
    if (this.sendTimer) clearInterval(this.sendTimer);
  },

  /**
   * 路线规划
   */
  async planRoute(origin, destination) {
    wx.showLoading({ title: '规划路线中...' });

    try {
      const res = await amap.drivingRoute(origin, destination);
      const route = res.route;
      const path = route.paths[0];   // 取第一条路线

      console.log('路线规划成功，步骤数:', path.steps.length);

      // 解析导航步骤
      this.routeSteps = this.parseSteps(path.steps);
      
      // 解析路线坐标用于地图显示
      const polylinePoints = this.parsePolyline(path.steps);
      this.routePolyline = polylinePoints;

      // 设置地图显示
      this.setData({
        polyline: [{
          points: polylinePoints,
          color: '#1296db',
          width: 8,
          arrowLine: true
        }],
        markers: [{
          id: 1,
          latitude: this.destLat,
          longitude: this.destLng,
          title: this.destName,
          width: 30,
          height: 30,
          callout: {
            content: this.destName,
            display: 'ALWAYS',
            fontSize: 14,
            padding: 5,
            borderRadius: 5
          }
        }],
        includePoints: [
          { latitude: this.data.latitude, longitude: this.data.longitude },
          { latitude: this.destLat, longitude: this.destLng }
        ]
      });

      // 显示第一步
      this.updateCurrentStep(0);

      // 显示总览信息
      this.setData({
        remainDistance: this.formatDistance(parseInt(path.distance)),
        remainTime: this.formatDuration(parseInt(path.duration))
      });

      // 启动实时位置追踪
      this.startLocationTracking();

      // 启动数据发送
      this.startDataSending();

    } catch (err) {
      console.error('路线规划失败:', err);
      wx.showToast({ title: '路线规划失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 解析导航步骤
   */
  parseSteps(steps) {
    return steps.map((step, index) => {
      // 获取步骤起点坐标
      const firstPoint = step.polyline.split(';')[0];
      const [lng, lat] = firstPoint.split(',').map(Number);

      // 判断转向类型
      const turnType = this.parseTurnType(step.action || step.instruction);

      return {
        index: index,
        instruction: step.instruction,
        distance: parseInt(step.distance),
        distanceText: this.formatDistance(parseInt(step.distance)),
        duration: parseInt(step.duration),
        action: step.action || '',
        orientation: step.orientation || '',
        road: step.road || '',
        turnType: turnType,
        startLng: lng,
        startLat: lat,
        // 保留原始坐标串
        polyline: step.polyline
      };
    });
  },

  /**
   * 判断转向类型
   */
  parseTurnType(actionOrInstruction) {
    const text = actionOrInstruction || '';
    if (text.includes('左转') || text.includes('向左')) return 'turn-left';
    if (text.includes('右转') || text.includes('向右')) return 'turn-right';
    if (text.includes('掉头') || text.includes('调头')) return 'uturn';
    if (text.includes('到达')) return 'arrive';
    return 'straight';
  },

  /**
   * 解析坐标串为地图polyline格式
   */
  parsePolyline(steps) {
    const points = [];
    steps.forEach(step => {
      const coords = step.polyline.split(';');
      coords.forEach(coord => {
        const [lng, lat] = coord.split(',').map(Number);
        if (!isNaN(lng) && !isNaN(lat)) {
          points.push({ latitude: lat, longitude: lng });
        }
      });
    });
    return points;
  },

  /**
   * 更新当前导航步骤
   */
  updateCurrentStep(index) {
    if (index >= this.routeSteps.length) {
      // 到达目的地
      this.onArrived();
      return;
    }

    const step = this.routeSteps[index];
    const nextStep = index + 1 < this.routeSteps.length 
      ? this.routeSteps[index + 1] 
      : null;

    this.setData({
      stepIndex: index,
      currentStep: step,
      nextStep: nextStep ? {
        instruction: nextStep.instruction
      } : null
    });

    // 检查交规提醒
    this.checkTrafficRules(step);

    console.log(`导航步骤 ${index + 1}/${this.routeSteps.length}: ${step.instruction}`);
  },

  /**
   * 启动实时位置追踪
   */
  startLocationTracking() {
    // 每3秒获取一次位置
    this.locationTimer = setInterval(() => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const { latitude, longitude, speed } = res;
          
          this.setData({
            latitude,
            longitude,
            currentSpeed: speed > 0 ? Math.round(speed * 3.6) : 0  // m/s → km/h
          });

          // 更新全局位置
          app.globalData.currentLocation = { lat: latitude, lng: longitude };

          // 检查是否需要切换到下一步
          this.checkStepTransition(longitude, latitude);

          // 更新剩余距离和时间
          this.updateRemainInfo(longitude, latitude);
        },
        fail: (err) => {
          // 开发工具中定位可能失败，不影响演示
          console.log('位置更新失败（开发工具中正常）');
        }
      });
    }, 3000);
  },

  /**
   * 检查是否应切换到下一导航步骤
   */
  checkStepTransition(lng, lat) {
    const currentIndex = this.data.stepIndex;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= this.routeSteps.length) {
      // 检查是否到达目的地
      const distToDest = this.calcDistance(lat, lng, this.destLat, this.destLng);
      if (distToDest < 50) {
        this.onArrived();
      }
      return;
    }

    const nextStep = this.routeSteps[nextIndex];
    const distToNextStep = this.calcDistance(
      lat, lng, nextStep.startLat, nextStep.startLng
    );

    // 距离下一步起点小于50米时切换
    if (distToNextStep < 50) {
      this.updateCurrentStep(nextIndex);
    }
  },

  /**
   * 更新剩余信息
   */
  updateRemainInfo(lng, lat) {
    const currentIndex = this.data.stepIndex;
    let remainDist = 0;
    let remainDur = 0;

    for (let i = currentIndex; i < this.routeSteps.length; i++) {
      remainDist += this.routeSteps[i].distance;
      remainDur += this.routeSteps[i].duration;
    }

    this.setData({
      remainDistance: this.formatDistance(remainDist),
      remainTime: this.formatDuration(remainDur)
    });
  },

  /**
   * 到达目的地
   */
  onArrived() {
    if (this.locationTimer) clearInterval(this.locationTimer);
    if (this.sendTimer) clearInterval(this.sendTimer);

    this.setData({
      currentStep: {
        instruction: '您已到达目的地',
        distanceText: '0米',
        road: this.destName,
        turnType: 'arrive'
      },
      nextStep: null,
      remainDistance: '0米',
      remainTime: '0分钟'
    });

    // 向ESP32发送到达指令
    if (app.globalData.isConnected) {
      const arriveData = protocol.packArriveMessage(this.destName);
      ble.sendData(arriveData);
    }

    wx.showModal({
      title: '导航结束',
      content: `您已到达${this.destName}`,
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
    });
  },

  /**
   * 启动定时向ESP32发送数据
   */
  startDataSending() {
    // 每2秒发送一次
    this.sendTimer = setInterval(() => {
      this.sendToESP32();
    }, 2000);
  },

  /**
   * 向ESP32发送当前导航数据
   */
  sendToESP32() {
    if (!app.globalData.isConnected) {
      this.setData({ isSending: false });
      return;
    }

    const step = this.data.currentStep;
    const alert = this.data.trafficAlert;

    // 打包数据
    const packet = protocol.packNavigationData({
      turnType: step.turnType || 'straight',
      distance: step.distanceText || '',
      instruction: step.instruction || '',
      road: step.road || '',
      speed: this.data.currentSpeed,
      remainDistance: this.data.remainDistance,
      remainTime: this.data.remainTime,
      alert: alert ? alert.message : ''
    });

    // 发送
    ble.sendData(packet);
    this.setData({ isSending: true });
  },

  /**
   * 结束导航
   */
  onStopNav() {
    wx.showModal({
      title: '确认',
      content: '确定要结束导航吗？',
      success: (res) => {
        if (res.confirm) {
          if (this.locationTimer) clearInterval(this.locationTimer);
          if (this.sendTimer) clearInterval(this.sendTimer);
          wx.navigateBack();
        }
      }
    });
  },

  // ==================== 工具方法 ====================

  /**
   * 计算两点间距离（米）- Haversine公式
   */
  calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * 格式化距离
   */
  formatDistance(meters) {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + '公里';
    }
    return meters + '米';
  },

  /**
   * 格式化时间
   */
  formatDuration(seconds) {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}小时${m}分`;
    }
    if (seconds >= 60) {
      return Math.ceil(seconds / 60) + '分钟';
    }
    return seconds + '秒';
  },

  /**
   * 检查交规提醒（调用traffic模块）
   */
  checkTrafficRules(step) {
    const alert = traffic.checkStep(step);
    this.setData({ trafficAlert: alert });
  }
});