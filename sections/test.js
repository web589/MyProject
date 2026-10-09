/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
const twoSum = (nums, target) => {
  const m = new Map();
  for (let i = 0; i < nums.length; i++) {
    const cru = nums[i];
    const need = target - cru;
    if (m.has(need)) {
      return [m.get(need), i];
    }
    m.set(cru, i);
  }
};

/**
 * @param {string[]} strs
 * @return {string[][]}
 */
var groupAnagrams = function (strs) {
  const m = new Map();
  for (let i = 0; i < strs.length; i++) {
    const str = strs[i];
    const key = str.split("").sort().join("");
    if (m.has(key)) {
      m.get(key).push(str);
    } else {
      m.set(key, [str]);
    }
  }
  return Array.from(m.values());
};

/**
 * @param {number[]} nums
 * @return {number}
 */
var longestConsecutive = (nums) => {
  const m = new Set(nums);
  let max = 0;
  for (const num of m) {
    if (!m.has(num - 1)) {
      let currentNum = num;
      let currentStreak = 1;
      while (m.has(currentNum + 1)) {
        currentNum += 1;
        currentStreak += 1;
        max = Math.max(max, currentStreak);
      }
    }
  }
  return max;
};

/**
 * @param {number[]} nums
 * @return {void} Do not return anything, modify nums in-place instead.
 */
var moveZeroes = function (nums) {
  let slow = 0;
  for (let fast = 0; fast < nums.length; fast++) {
    if (nums[fast] !== 0) {
      nums[slow] = nums[fast];
      if (slow !== fast) {
        nums[fast] = 0;
      }
      slow++;
    }
  }
};

/**
 * @param {number[]} height
 * @return {number}
 */
var maxArea = function (height) {
  let left = 0;
  let right = height.length - 1;
  let area = 0;
  while (left < right) {
    let curArea = (right - left) * Math.min(height[left], height[right]);
    area = Math.max(curArea, area);

    if (height[left] < height[right]) {
      left++;
    } else {
      right--;
    }
  }
  return area;
};

/**
 * @param {number[]} nums
 * @return {number[][]}
 */
var threeSum = function (nums) {
  let ans = [];
  const len = nums.length;
  if (nums == null || len < 3) return ans;
  nums.sort((a, b) => a - b);
  for (let i = 0; i < len; i++) {
    if (nums[i] > 0) break;
    if (i > 0 && nums[i] == nums[i - 1]) continue;
    let L = i + 1;
    let R = len - 1;
    while (L < R) {
      const sum = nums[i] + nums[L] + nums[R];
      if (sum == 0) {
        ans.push([nums[i], nums[L], nums[R]]);
        while (L < R && nums[L] == nums[L + 1]) L++;
        while (L < R && nums[R] == nums[R - 1]) R--;
        L++;
        R--;
      } else if (sum < 0) {
        L++;
      } else if (sum > 0) {
        R--;
      }
    }
  }
  return ans;
};
