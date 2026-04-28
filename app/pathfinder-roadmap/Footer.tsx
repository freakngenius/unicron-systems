import styles from './roadmap.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <ul className={styles.footerLinks}>
        <li>
          <a href="https://pathfinder.unicron.systems" className={styles.link}>
            Pathfinder dashboard
          </a>
        </li>
        <li>
          <a href="https://unicron.systems" className={styles.link}>
            unicron.systems
          </a>
        </li>
        <li>
          <a href="mailto:kyle@freakngenius.com" className={styles.link}>
            kyle@freakngenius.com
          </a>
        </li>
      </ul>
      <p className={styles.copyright}>&copy; 2026 Unicron Systems</p>
    </footer>
  );
}
