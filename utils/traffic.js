// utils/traffic.js

/**
 * 交规提醒模块
 * 
 * 功能：根据导航步骤信息，生成交规提醒
 * 
 * 提醒类型：
 * 1. 限速提醒 - 根据道路类型
 * 2. 转弯提醒 - 大转弯、掉头时提醒减速
 * 3. 学校/医院区域提醒
 * 4. 高速公路提醒
 * 5. 拥堵提醒
 */

// 道路类型与限速映射
const SPEED_LIMITS = {
    '高速': { limit: 120, message: '高速公路限速120km/h' },
    '快速路': { limit: 100, message: '快速路限速100km/h' },
    '城市道路': { limit: 60, message: '城市道路限速60km/h' },
    '国道': { limit: 70, message: '国道限速70km/h' },
    '乡道': { limit: 40, message: '乡村道路限速40km/h' },
    '默认': { limit: 60, message: '注意限速' }
  };
  
  // 关键词触发的提醒
  const KEYWORD_ALERTS = [
    {
      keywords: ['学校', '小学', '中学', '幼儿园'],
      message: '⚠️ 前方学校区域，限速30km/h',
      icon: 'speed-limit',
      priority: 1
    },
    {
      keywords: ['医院'],
      message: '⚠️ 前方医院区域，禁止鸣笛',
      icon: 'camera',
      priority: 1
    },
    {
      keywords: ['隧道'],
      message: '⚠️ 即将进入隧道，请开启车灯',
      icon: 'camera',
      priority: 2
    },
    {
      keywords: ['高速', '匝道'],
      message: '⚠️ 高速匝道，请减速慢行',
      icon: 'speed-limit',
      priority: 1
    },
    {
      keywords: ['环岛', '转盘'],
      message: '⚠️ 前方环岛，注意让行',
      icon: 'camera',
      priority: 2
    },
    {
      keywords: ['收费站'],
      message: '⚠️ 前方收费站，请减速',
      icon: 'speed-limit',
      priority: 2
    }
  ];
  
  /**
   * 根据导航步骤检查交规提醒
   * @param {Object} step 导航步骤
   * @returns {Object|null} 提醒信息 {message, icon, type}
   */
  function checkStep(step) {
    if (!step) return null;
  
    const alerts = [];
    const instruction = step.instruction || '';
    const road = step.road || '';
    const action = step.action || '';
    const fullText = instruction + road + action;
  
    // 1. 检查关键词提醒
    for (const rule of KEYWORD_ALERTS) {
      for (const keyword of rule.keywords) {
        if (fullText.includes(keyword)) {
          alerts.push({
            message: rule.message,
            icon: rule.icon,
            type: 'keyword',
            priority: rule.priority
          });
          break;  // 一个规则只触发一次
        }
      }
    }
  
    // 2. 转弯提醒
    if (step.turnType === 'uturn') {
      alerts.push({
        message: '⚠️ 前方掉头，请注意对向来车',
        icon: 'camera',
        type: 'turn',
        priority: 1
      });
    } else if (step.turnType === 'turn-left' || step.turnType === 'turn-right') {
      const dir = step.turnType === 'turn-left' ? '左' : '右';
      alerts.push({
        message: `⚠️ 前方${dir}转，请减速慢行`,
        icon: 'camera',
        type: 'turn',
        priority: 3
      });
    }
  
    // 3. 超速检测（需要当前速度信息，在navigate.js中额外检查）
  
    // 返回优先级最高的提醒
    if (alerts.length === 0) return null;
    
    alerts.sort((a, b) => a.priority - b.priority);
    return alerts[0];
  }
  
  /**
   * 超速检测
   * @param {number} currentSpeed 当前速度 km/h
   * @param {string} roadName 道路名称
   * @returns {Object|null}
   */
  function checkSpeed(currentSpeed, roadName) {
    if (currentSpeed <= 0) return null;
  
    // 根据道路名判断限速
    let speedLimit = SPEED_LIMITS['默认'];
    
    for (const [key, value] of Object.entries(SPEED_LIMITS)) {
      if (roadName && roadName.includes(key)) {
        speedLimit = value;
        break;
      }
    }
  
    if (currentSpeed > speedLimit.limit) {
      return {
        message: `⚠️ 当前${currentSpeed}km/h，${speedLimit.message}`,
        icon: 'speed-limit',
        type: 'overspeed'
      };
    }
  
    // 接近限速时预警
    if (currentSpeed > speedLimit.limit * 0.9) {
      return {
        message: `注意：接近限速${speedLimit.limit}km/h`,
        icon: 'speed-limit',
        type: 'speed-warning'
      };
    }
  
    return null;
  }
  
  /**
   * 生成适老化提醒文字（简化、加大、直白）
   * @param {Object} alert 原始提醒
   * @returns {Object} 适老化后的提醒
   */
  function elderlyFriendly(alert) {
    if (!alert) return null;
  
    // 简化文字，去掉复杂符号
    let message = alert.message
      .replace('⚠️', '')
      .replace('，', '\n')    // 换行显示，更清晰
      .trim();
  
    return {
      ...alert,
      message: message,
      // 标记为大字体显示
      fontSize: 'large'
    };
  }
  
  module.exports = {
    checkStep,
    checkSpeed,
    elderlyFriendly,
    SPEED_LIMITS
  };