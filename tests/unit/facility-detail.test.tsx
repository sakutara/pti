import { render, screen, within } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import type { Facility } from '../../src/domain/facilities-schema'
import { mapUrl } from '../../src/domain/facility-search'
import { FacilityDetail } from '../../src/ui/FacilityDetail'

const bachMai: Facility = {
  id: 'f-76c24651ba2f',
  name: 'Bệnh viện Bạch Mai',
  nameEn: 'BACH MAI HOSPITAL',
  phone: '0969 851 616 / 1900 888 866',
  address: 'Số 78, đường Giải Phóng, Phường Kim Liên, Thành phố Hà Nội',
  provinceCode: '01',
  provinceName: 'Thành phố Hà Nội',
  hours: 'KYC: T2-6: 06h-20h | T7-CN: 06:30-16:30',
  specialty: 'Đa khoa',
  inpatient: true,
  outpatient: true,
  dental: false,
  blacklisted: false,
  network: 'pti',
}

describe('facilities.detail.phones', () => {
  it('facilities.detail.phones: two call links point at tel: for each number', () => {
    render(<FacilityDetail facility={bachMai} />)

    expect(screen.getByRole('link', { name: /0969851616/ })).toHaveAttribute('href', 'tel:0969851616')
    expect(screen.getByRole('link', { name: /1900888866/ })).toHaveAttribute('href', 'tel:1900888866')
  })

  it('facilities.detail.phones: without a phone number says so and offers no call link', () => {
    render(<FacilityDetail facility={{ ...bachMai, phone: null }} />)

    expect(screen.getByText('Chưa có số điện thoại')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gọi/ })).toBeNull()
  })
})

describe('facilities.detail.map', () => {
  it('facilities.detail.map: the map action links to the Google Maps search for name and address', () => {
    render(<FacilityDetail facility={bachMai} />)

    const link = screen.getByRole('link', { name: 'Bản đồ' })
    expect(link).toHaveAttribute('href', mapUrl(bachMai))
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
    expect(link.getAttribute('href')).toContain(encodeURIComponent('Bệnh viện Bạch Mai'))
  })
})

describe('facilities.detail.a11y', () => {
  it('facilities.detail.a11y: icon-only call and map controls are links named with the number or "Bản đồ"', () => {
    render(<FacilityDetail facility={bachMai} />)

    const links = screen.getAllByRole('link')
    const names = links.map((l) => l.getAttribute('aria-label') ?? l.textContent ?? '')
    expect(names.filter((n) => n.includes('0969851616'))).toHaveLength(1)
    expect(names.filter((n) => n.includes('1900888866'))).toHaveLength(1)
    expect(names).toContain('Bản đồ')
  })
})

describe('facilities.detail.content', () => {
  it('facilities.detail.content: shows name, address, specialty, direct-billing services, hours and the documents reminder', () => {
    render(<FacilityDetail facility={bachMai} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Bệnh viện Bạch Mai' })).toBeInTheDocument()
    expect(screen.getByText(bachMai.address)).toBeInTheDocument()
    expect(screen.getByText('Đa khoa')).toBeInTheDocument()
    expect(screen.getByText('KYC: T2-6: 06h-20h | T7-CN: 06:30-16:30')).toBeInTheDocument()

    const services = screen.getByRole('list', { name: 'Dịch vụ bảo lãnh' })
    expect(within(services).getByText('Nội trú')).toBeInTheDocument()
    expect(within(services).getByText('Ngoại trú')).toBeInTheDocument()
    expect(within(services).queryByText('Nha khoa')).toBeNull()

    expect(screen.getByText(/CCCD hoặc hộ chiếu/)).toBeInTheDocument()
    expect(screen.getByText(/giấy khai sinh/)).toBeInTheDocument()
  })

  it('facilities.detail.content: says when no hours are known', () => {
    render(<FacilityDetail facility={{ ...bachMai, hours: null }} />)

    expect(screen.getByText('Chưa có thông tin giờ nhận bảo lãnh')).toBeInTheDocument()
  })
})
