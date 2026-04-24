class SetKlaosBranding < ActiveRecord::Migration[7.0]
  # Zammad installs package files under Rails.root — our `assets/` folder
  # in the .zpm ends up at /opt/zammad/assets/* on disk.
  LOGO_CANDIDATES = %w[
    assets/logo-klaos.svg
    assets/images/klaos/logo-klaos.svg
  ].freeze

  def up
    Setting.set('product_name', 'KLaOS Helpdesk')
    Setting.set('organization', 'KLaOS')

    apply_logo!
  end

  def down
    # Leave text branding on uninstall — reverting would clobber a user's
    # own customization made after install. Logo is re-stored on re-install.
  end

  private

  def apply_logo!
    path = LOGO_CANDIDATES
      .map { |p| Rails.root.join(p) }
      .find(&:exist?)

    unless path
      Rails.logger.warn "klaos-branding: logo SVG not found, skipping"
      return
    end

    svg = File.binread(path)
    Service::SystemAssets::ProductLogo.store(svg)
    Rails.logger.info "klaos-branding: logo stored from #{path}"
  rescue => e
    Rails.logger.error "klaos-branding: failed to store logo: #{e.class}: #{e.message}"
  end
end
