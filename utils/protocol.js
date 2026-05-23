// utils/protocol.js

/**
 * 小程序与ESP32的通信协议
 * 
 * 数据格式：JSON字符串，以\n结尾
 * 
 * 消息类型：
 * 1. NAV  - 导航信息
 * 2. ALERT - 交规提醒
 * 3. ARRIVE - 到达目的地
 * 4. HEARTBEAT - 心跳
 */

/**
 * 打包导航数据
 * @param {Object} data 导航数据
 * @returns {string} JSON字符串
 */
function packNavigationData(data) {
    const packet = {
      type: 'NAV',
      ts: Date.now(),          // 时间戳
      data: {
        turn: data.turnType || 'straight',     // 转向：straight/turn-left/turn-right/uturn/arrive
        dist: data.distance || '',              // 距离文字："500米"
        inst: data.instruction || '',           // 指令简要（截取前20字）
        road: data.road || '',                  // 道路名
        spd: data.speed || 0,                   // 当前速度
        rDist: data.remainDistance || '',        // 剩余距离
        rTime: data.remainTime || '',           // 剩余时间
        alert: data.alert || ''                 // 交规提醒
      }
    };
  
    // 限制指令文字长度（BLE单次传输有限制）
    if (packet.data.inst.length > 20) {
      packet.data.inst = packet.data.inst.substring(0, 20);
    }
  
    return JSON.stringify(packet) + '\n';
  }
  
  /**
   * 打包到达消息
   */
  function packArriveMessage(destName) {
    const packet = {
      type: 'ARRIVE',
      ts: Date.now(),
      data: {
        dest: destName || '目的地'
      }
    };
    return JSON.stringify(packet) + '\n';
  }
  
  /**
   * 打包心跳消息
   */
  function packHeartbeat() {
    const packet = {
      type: 'HB',
      ts: Date.now()
    };
    return JSON.stringify(packet) + '\n';
  }
  
  /**
   * 将字符串转为ArrayBuffer（BLE发送需要）
   * @param {string} str 字符串
   * @returns {ArrayBuffer}
   */
  function stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }
  
  /**
   * 将ArrayBuffer转为字符串（接收BLE数据时用）
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  function arrayBufferToString(buffer) {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }
  
  /**
   * 分包发送（BLE单次最多发送20字节，需要分包）
   * @param {string} data 完整数据
   * @returns {Array<ArrayBuffer>} 分包后的数据数组
   */
  function splitPackets(data, mtu = 20) {
    const bytes = new TextEncoder().encode(data);
    const packets = [];
    
    for (let i = 0; i < bytes.length; i += mtu) {
      const chunk = bytes.slice(i, i + mtu);
      packets.push(chunk.buffer);
    }
    
    return packets;
  }
  
  module.exports = {
    packNavigationData,
    packArriveMessage,
    packHeartbeat,
    stringToArrayBuffer,
    arrayBufferToString,
    splitPackets
  };