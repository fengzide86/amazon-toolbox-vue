// Chart.js 按需注册 - 减少打包体积
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarElement,
  ArcElement
} from 'chart.js'

// 全局注册所有需要的图表类型（只注册一次）
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarElement,
  ArcElement
)

export { ChartJS }