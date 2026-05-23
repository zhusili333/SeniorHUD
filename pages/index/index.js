// pages/index/index.js
const amap = require('../../utils/amap.js');
const app = getApp();

Page({
  data: {
    latitude: 39.908823,      // 默认北京天安门
    longitude: 116.397470,
    address: '',
    destination: '',
    searchResults: [],
    selectedDest: null,        // 选中的目的地 {lng, lat, name}
    markers: [],
    polyline: [],
    isConnected: false
  },

  onLoad() {
    this.getLocation();
  },

  onShow() {
    // 每次显示页面时更新蓝牙连接状态
    this.setData({
      isConnected: app.globalData.isConnected
    });
  },

  /**
   * 获取当前位置
   */
  getLocation() {
    wx.showLoading({ title: '定位中...' });
    
    wx.getLocation({
      type: 'gcj02',   // 高德使用的坐标系
      success: (res) => {
        console.log('定位成功:', res);
        const { latitude, longitude } = res;
        
        this.setData({ latitude, longitude });
        
        // 保存到全局
        app.globalData.currentLocation = {
          lat: latitude,
          lng: longitude
        };

        // 逆地理编码获取地址
        this.getAddress(longitude, latitude);
      },
      fail: (err) => {
        console.error('定位失败:', err);
        wx.showToast({ title: '定位失败，使用默认位置', icon: 'none' });
        // 使用默认位置的逆地理编码
        this.getAddress(this.data.longitude, this.data.latitude);
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  /**
   * 逆地理编码
   */
  async getAddress(lng, lat) {
    try {
      const res = await amap.reverseGeocode(lng, lat);
      const address = res.regeocode.formatted_address;
      this.setData({ address });
      console.log('当前地址:', address);
    } catch (err) {
      console.error('逆地理编码失败:', err);
    }
  },

  /**
   * 目的地输入
   */
  onDestInput(e) {
    this.setData({ destination: e.detail.value });
  },

  /**
   * 搜索目的地
   */
  async onSearch() {
    const keyword = this.data.destination.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入目的地', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    try {
      const location = `${this.data.longitude},${this.data.latitude}`;
      const res = await amap.searchPOI(keyword, '', location);
      
      const results = res.pois.map(poi => ({
        id: poi.id,
        name: poi.name,
        address: poi.address || poi.cityname + poi.adname,
        location: poi.location   // "lng,lat" 字符串
      }));

      this.setData({ searchResults: results });
      
      if (results.length === 0) {
        wx.showToast({ title: '未找到相关地点', icon: 'none' });
      }
    } catch (err) {
      console.error('搜索失败:', err);
      wx.showToast({ title: '搜索失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 选择目的地
   */
  onSelectDest(e) {
    const index = e.currentTarget.dataset.index;
    const dest = this.data.searchResults[index];
    const [lng, lat] = dest.location.split(',').map(Number);

    const selectedDest = {
      lng: lng,
      lat: lat,
      name: dest.name
    };

    // 在地图上标记目的地
    const markers = [{
      id: 1,
      latitude: lat,
      longitude: lng,
      title: dest.name,
      iconPath: '/static/icons/destination.png',   // 可以用默认的
      width: 30,
      height: 30,
      callout: {
        content: dest.name,
        display: 'ALWAYS',
        fontSize: 14,
        padding: 5,
        borderRadius: 5
      }
    }];

    this.setData({
      selectedDest,
      markers,
      searchResults: [],   // 清空搜索结果
      destination: dest.name
    });

    wx.showToast({ title: `已选择: ${dest.name}`, icon: 'none' });
  },

  /**
   * 开始导航
   */
  onStartNav() {
    if (!this.data.selectedDest) {
      wx.showToast({ title: '请先选择目的地', icon: 'none' });
      return;
    }

    // 跳转到导航页面，传递参数
    const dest = this.data.selectedDest;
    const origin = app.globalData.currentLocation || {
      lng: this.data.longitude,
      lat: this.data.latitude
    };

    wx.navigateTo({
      url: `/pages/navigate/navigate?originLng=${origin.lng}&originLat=${origin.lat}&destLng=${dest.lng}&destLat=${dest.lat}&destName=${encodeURIComponent(dest.name)}`
    });
  },

  /**
   * 跳转蓝牙页面
   */
  goToBluetooth() {
    wx.navigateTo({
      url: '/pages/bluetooth/bluetooth'
    });
  }
});