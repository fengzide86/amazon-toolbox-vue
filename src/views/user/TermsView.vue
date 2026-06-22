<template>
  <main class="terms-container">
    <div class="terms-card">
      <div class="terms-header">
        <h1>服务条款</h1>
        <p class="terms-date">最后更新：2026年6月4日</p>
      </div>

      <div class="terms-content">
        <section>
          <h2>1. 服务说明</h2>
          <p>跨境电商赛训效率工具箱（以下简称"本工具"）是由开发团队提供的一款面向跨境电商卖家的效率工具软件。本工具提供包括物流模板管理、自动上广告、自动发货、自动上品、自动发FBA/AGL等功能模块。</p>
        </section>

        <section>
          <h2>2. 授权码使用</h2>
          <p>2.1 本工具采用授权码机制进行激活和使用。每个授权码只能绑定一台Windows设备。</p>
          <p>2.2 授权码的有效期以购买时选择的套餐为准，到期后需续费才能继续使用。</p>
          <p>2.3 严禁将授权码转让、共享或出售给第三方使用。</p>
          <p>2.4 如需更换绑定设备，请联系客服处理。</p>
        </section>

        <section>
          <h2>3. 套餐与退款</h2>
          <p>3.1 本工具提供多种套餐供用户选择，具体套餐内容和价格以购买页面展示为准。</p>
          <p>3.2 购买后24小时内，如未激活使用授权码，可申请全额退款。</p>
          <p>3.3 已激活使用的授权码不支持退款。</p>
          <p>3.4 退款请联系客服微信处理。</p>
        </section>

        <section>
          <h2>4. 使用规范</h2>
          <p>4.1 用户应合法合规地使用本工具，不得利用本工具从事任何违反法律法规的活动。</p>
          <p>4.2 用户不得对本工具进行逆向工程、反编译或破解。</p>
          <p>4.3 用户不得利用本工具发送垃圾信息、恶意刷单等违规行为。</p>
          <p>4.4 如因用户违规使用导致账号被封或其他损失，由用户自行承担。</p>
        </section>

        <section>
          <h2>5. 隐私保护</h2>
          <p>5.1 本工具会收集用户的设备信息（设备ID、设备名称）用于授权码绑定。</p>
          <p>5.2 本工具会记录用户运行工具时的日志数据（工具名称、运行状态、运行时间）。</p>
          <p>5.3 我们不会将用户信息泄露给第三方，除非法律要求。</p>
        </section>

        <section>
          <h2>6. 免责声明</h2>
          <p>6.1 本工具按"现状"提供，不保证所有功能在所有环境下均能正常运行。</p>
          <p>6.2 因网络问题、系统兼容性问题或第三方平台政策变更导致的功能异常，开发团队不承担责任。</p>
          <p>6.3 用户使用本工具产生的任何业务决策和结果，由用户自行负责。</p>
        </section>

        <section>
          <h2>7. 联系方式</h2>
          <p>如有疑问或需要帮助，请通过以下方式联系我们：</p>
          <ul>
            <li>客服微信：AmazonToolbox_Support</li>
            <li>工作时间为每周一至周日 9:00-22:00</li>
          </ul>
        </section>
      </div>

      <div class="terms-footer">
        <router-link to="/user/login" class="btn btn-primary" style="text-decoration:none;">返回登录</router-link>
      </div>
    </div>
  </main>
</template>

<script setup>
</script>

<style scoped>
.terms-container {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
}
.terms-card {
  background: white;
  border-radius: 24px;
  padding: 3rem;
  max-width: 800px;
  width: 100%;
  box-shadow: 0 25px 50px rgba(15,23,42,0.1);
  border: 1px solid var(--color-border);
}
.terms-header {
  text-align: center;
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}
.terms-header h1 {
  font-family: var(--font-heading);
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}
.terms-date {
  font-size: 0.85rem;
  color: var(--color-muted);
}
.terms-content section {
  margin-bottom: 2rem;
}
.terms-content h2 {
  font-family: var(--font-heading);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 0.75rem;
  padding-left: 0.75rem;
  border-left: 3px solid var(--color-accent);
}
.terms-content p {
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.7;
  margin-bottom: 0.5rem;
}
.terms-content ul {
  padding-left: 1.5rem;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.7;
}
.terms-footer {
  text-align: center;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
}
@media (max-width: 640px) {
  .terms-card { padding: 1.5rem; }
  .terms-container { padding: 1rem; }
}
</style>