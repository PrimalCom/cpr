import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  Database,
  Layers3,
  Ruler,
  Share2,
  Upload,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const features = [
    {
      icon: <Upload className="w-12 h-12 text-red-400" />,
      title: 'DICOM Upload',
      description:
        'Upload coronary CTA DICOM series directly or load from PACS with automatic metadata extraction.',
    },
    {
      icon: <Layers3 className="w-12 h-12 text-red-400" />,
      title: '3D Vessel Visualization',
      description:
        'Interactive 3D surface rendering of vessel segmentation with VTK.js for LAD, LCX, and RCA vessels.',
    },
    {
      icon: <Activity className="w-12 h-12 text-red-400" />,
      title: 'Centerline Generation',
      description:
        'Two-click workflow for manual centerline creation with automatic B-spline interpolation.',
    },
    {
      icon: <Share2 className="w-12 h-12 text-red-400" />,
      title: 'Curved MPR',
      description:
        'Volume reformatting along finalized centerlines with progressive loading and caching.',
    },
    {
      icon: <Ruler className="w-12 h-12 text-red-400" />,
      title: 'Cross-Sectional Analysis',
      description:
        'Geometry-correct perpendicular slices with lumen area, vessel wall area, and plaque quantification.',
    },
    {
      icon: <Database className="w-12 h-12 text-red-400" />,
      title: 'Persistent Storage',
      description:
        'Centerlines, measurements, and session data persisted with full audit logging.',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-pink-500/10 to-rose-500/10"></div>
        <div className="relative max-w-5xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-black text-white mb-6">
            <span className="bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
              Coronary Curved MPR
            </span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-300 mb-4 font-light">
            Advanced Coronary Artery Analysis Platform
          </p>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-8">
            Web-based tool for coronary CTA analysis with 3D vessel visualization,
            manual centerline generation, curved multi-planar reconstruction, and
            quantitative measurements.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/upload"
              className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-red-500/50"
            >
              Upload DICOM
            </Link>
            <Link
              to="/studies"
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              View Studies
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
