import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { weatherData } from '../test/factories'
import WeatherWidget from './WeatherWidget.vue'

describe('WeatherWidget', () => {
  it('shows the current temperature, conditions and place', () => {
    const wrapper = mount(WeatherWidget, { props: { data: weatherData() } })
    expect(wrapper.get('[data-testid="temperature"]').text()).toBe('11°')
    expect(wrapper.text()).toContain('Overcast')
    expect(wrapper.text()).toContain('Utrecht')
  })

  it('shows the five day forecast with highs and lows', () => {
    const wrapper = mount(WeatherWidget, { props: { data: weatherData() } })
    const days = wrapper.findAll('li')
    expect(days).toHaveLength(5)
    expect(days[0]!.text()).toContain('15°')
    expect(days[0]!.text()).toContain('9°')
    expect(days[0]!.text()).toMatch(/Mon/)
  })

  it('credits Open-Meteo with a link', () => {
    const wrapper = mount(WeatherWidget, { props: { data: weatherData() } })
    const link = wrapper.get('a')
    expect(link.text()).toBe('Weather data by Open-Meteo.com')
    expect(link.attributes()).toMatchObject({
      href: 'https://open-meteo.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('says so when the data is stale', () => {
    const fresh = mount(WeatherWidget, { props: { data: weatherData() } })
    expect(fresh.text()).not.toContain('out of date')
    const stale = mount(WeatherWidget, { props: { data: weatherData({ stale: true }) } })
    expect(stale.get('[role="status"]').text()).toContain('out of date')
  })
})
