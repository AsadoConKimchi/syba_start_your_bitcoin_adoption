import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, tier } = await req.json()

    if (!code || !tier) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Missing code or tier' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validTiers = ['monthly', 'annual', 'lifetime']
    if (!validTiers.includes(tier)) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Invalid tier' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .ilike('code', code.trim())
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({ valid: false, reason: '존재하지 않는 할인코드입니다' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()

    if (new Date(data.valid_until) < now) {
      return new Response(
        JSON.stringify({ valid: false, reason: '만료된 할인코드입니다' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (new Date(data.valid_from) > now) {
      return new Response(
        JSON.stringify({ valid: false, reason: '아직 사용할 수 없는 할인코드입니다' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (data.max_uses !== -1 && data.current_uses >= data.max_uses) {
      return new Response(
        JSON.stringify({ valid: false, reason: '사용 한도가 초과된 할인코드입니다' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!data.applicable_tiers.includes(tier)) {
      return new Response(
        JSON.stringify({ valid: false, reason: '이 구독 플랜에 적용할 수 없는 할인코드입니다' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        valid: true,
        discount: {
          id: data.id,
          code: data.code,
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          applicable_tiers: data.applicable_tiers,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ valid: false, reason: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
