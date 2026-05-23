// utils/amap.js
const app = getApp();

const AMAP_BASE = 'https://restapi.amap.com/v3';

/**
 * 高德API通用请求方法
 */
function amapRequest(path, params) {
  return new Promise((resolve, reject) => {
    const key = app.globalData.amapKey;
    const url = `${AMAP_BASE}${path}`;
    
    wx.request({
      url: url,
      data: {
        key: key,
        ...params
      },
      method: 'GET',
      success(res) {
        if (res.data.status === '1') {
          resolve(res.data);
        } else {
          reject(new Error(res.data.info || 'API请求失败'));
        }
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

/**
 * 逆地理编码：经纬度 → 地址文字
 * @param {number} lng 经度
 * @param {number} lat 纬度
 */
function reverseGeocode(lng, lat) {
  return amapRequest('/geocode/regeo', {
    location: `${lng},${lat}`,
    extensions: 'all',     // 返回详细信息（包含道路、POI等）
    radius: 200
  });
}

/**
 * 地理编码：地址文字 → 经纬度
 * @param {string} address 地址文字
 * @param {string} city 城市（可选）
 */
function geocode(address, city = '') {
  return amapRequest('/geocode/geo', {
    address: address,
    city: city
  });
}

/**
 * 关键词搜索POI
 * @param {string} keywords 关键词
 * @param {string} city 城市
 * @param {string} location 中心点坐标 "lng,lat"
 */
function searchPOI(keywords, city = '', location = '') {
  return amapRequest('/place/around', {
    keywords: keywords,
    location: location,
    radius: 5000,
    offset: 10,       // 每页10条
    page: 1
  });
}

/**
 * 驾车路线规划（核心功能）
 * @param {string} origin 起点 "lng,lat"
 * @param {string} destination 终点 "lng,lat"
 */
function drivingRoute(origin, destination) {
  return amapRequest('/direction/driving', {
    origin: origin,
    destination: destination,
    extensions: 'all',         // 返回详细导航步骤
    strategy: 0                // 0=速度优先
  });
}

/**
 * 步行路线规划
 */
function walkingRoute(origin, destination) {
  return amapRequest('/direction/walking', {
    origin: origin,
    destination: destination
  });
}

module.exports = {
  reverseGeocode,
  geocode,
  searchPOI,
  drivingRoute,
  walkingRoute
};